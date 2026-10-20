package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.run.RunService
import cz.morosystems.aml.engine.sql.Period
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.util.concurrent.Executors
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

/** One transaction the backtest saw flagged before, after, or both. [before]/[after] are ratings, null when not flagged. */
data class BacktestRow(
    val id: String,
    val clientId: String,
    val amount: Double,
    val ts: LocalDateTime,
    val before: String?,
    val after: String?,
    /** `NEW`, `RAISED`, `LOWERED`, `DROPPED` or `UNCHANGED`. */
    val change: String,
    /** It changed because the rule itself is about it. */
    val byRule: Boolean,
    /** It changed through the triage of its alert, which holds other transactions' hits; with [byRule] too, both. */
    val byTriage: Boolean,
)

/** A draft's stored backtest without its rows, which are paged (`backtest_row`). The counts are 0 until it is DONE. */
data class Backtest(
    val ruleKey: String,
    val ruleName: String?,
    val draftId: Long,
    val draftVersion: Int,
    /** The version the draft replaces; null for a new rule. */
    val activeVersion: Int?,
    val from: LocalDate,
    val to: LocalDate,
    /** `RUNNING`, `DONE` or `FAILED`. */
    val status: String,
    /** Why it failed. */
    val error: String?,
    /** Transactions in the period, every one of them replayed. */
    val transactions: Int,
    val newCount: Int,
    val droppedCount: Int,
    val changedCount: Int,
    val unchangedCount: Int,
    /** Transactions of the period with an open alert after the change: the `all` view. */
    val alerts: Int,
    /** Cases in the period people closed as false positive in the current production run. */
    val falsePositives: Int,
    /** Of [falsePositives], those the draft no longer flags. */
    val falsePositivesCleared: Int,
    /** Cases in the period people reported in the current production run. */
    val reported: Int,
    /** Of [reported], those the draft would let through without an open alert. */
    val falseNegatives: Int,
    val createdAt: OffsetDateTime?,
)

/** What a finished replay stores: the transactions replayed, the false positives and negatives and the compared rows. */
data class BacktestResult(
    val transactions: Int,
    val falsePositives: Int,
    val falsePositivesCleared: Int,
    val reported: Int,
    val falseNegatives: Int,
    val rows: List<BacktestRow>,
)

/** One page of a backtest's rows, in the backtest's order, and how many rows the view has in all. */
data class BacktestRows(val items: List<BacktestRow>, val page: Int, val size: Int, val total: Int)

/**
 * Shows what a draft rule version would have changed in a period: the rules run once as they are active and once
 * with the draft in place of its active version (or added, for a new rule), each over all the data with triage, as
 * a production run does, and the period's cases, as the review queue lists them, are compared before and after. Both runs are rolled back, so no production run, alert or case is left; the comparison is stored
 * apart, in `backtest` and `backtest_row` (ADR-0049). It runs in the background, one at a time; starting one deletes
 * every stored backtest, and a backtest deleted while it runs drops its result.
 */
@Service
class BacktestService(
    private val rules: RuleRepository,
    private val runs: RunService,
    private val jdbc: JdbcClient,
    private val store: BacktestRepository,
    transactions: PlatformTransactionManager,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val rollback = TransactionTemplate(transactions)
    private val worker = Executors.newSingleThreadExecutor()

    @EventListener(ApplicationReadyEvent::class)
    fun failInterrupted() = store.failInterrupted()

    /**
     * Starts backtesting [draftId] over [from]..[to] (dates, inclusive) and returns it RUNNING at once.
     * @return null when there is no version [draftId]
     * @throws InvalidRuleException when [draftId] is not a draft or the period is backwards
     */
    fun start(draftId: Long, from: LocalDate, to: LocalDate, userId: Long?): Backtest? {
        val draft = rules.find(draftId) ?: return null
        if (draft.status != "draft") throw InvalidRuleException("only a draft can be backtested; ${draft.rule.key} v${draft.rule.version} is ${draft.status}")
        if (from > to) throw InvalidRuleException("the period starts after it ends")
        val replaced = rules.activeRules().firstOrNull { it.sameSlot(draft.rule) }
        val id = store.start(
            Backtest(
                ruleKey = draft.rule.key,
                ruleName = draft.name ?: replaced?.let { r -> rules.find(r.id)?.name },
                draftId = draftId,
                draftVersion = draft.rule.version,
                activeVersion = replaced?.version,
                from = from,
                to = to,
                status = "RUNNING",
                error = null,
                transactions = 0,
                newCount = 0,
                droppedCount = 0,
                changedCount = 0,
                unchangedCount = 0,
                alerts = 0,
                falsePositives = 0,
                falsePositivesCleared = 0,
                reported = 0,
                falseNegatives = 0,
                createdAt = null,
            ),
            userId,
        )
        val period = Period(from.atStartOfDay(), to.plusDays(1).atStartOfDay())
        worker.submit { compute(id, draft.rule, period) }
        return store.summary(draftId)
    }

    /** The draft's stored backtest; null when it has none. */
    fun summary(draftId: Long): Backtest? = store.summary(draftId)

    /** A page of the stored rows in one view: `all` (an open alert after the change), `changed` (rating raised or lowered), `new` or `dropped`. */
    fun rows(draftId: Long, view: String, page: Int, size: Int): BacktestRows? = store.rows(draftId, view, page, size)

    private fun compute(id: Long, draft: RuleDefinition, period: Period) {
        try {
            val result = rollback.execute { status ->
                status.setRollbackOnly()
                // Read before the replays, which add runs of their own.
                val started = System.nanoTime()
                val took = { "${(System.nanoTime() - started) / 1_000_000_000}s" }
                val falsePositives = closedAs(FALSE_POSITIVE, period)
                val reported = closedAs(REPORTED, period)
                val active = rules.activeRules()
                // Both runs cover all the data, as a production run does; the period's cases are compared.
                val replaced = active.firstOrNull { it.sameSlot(draft) }
                val before = cases(runs.run(ruleSet = active, export = false).runId, period)
                log.info("backtest {}: active rules run at {}", id, took())
                val after = cases(runs.run(ruleSet = active.filterNot { it.sameSlot(draft) } + draft, export = false).runId, period)
                log.info("backtest {}: draft run at {}", id, took())
                BacktestResult(
                    transactions = jdbc.sql("select count(*) from transaction where ts >= ? and ts < ?")
                        .params(period.from, period.toExclusive).query(Int::class.java).single(),
                    falsePositives = falsePositives.size,
                    falsePositivesCleared = falsePositives.count { it !in after },
                    reported = reported.size,
                    falseNegatives = reported.count { it !in after },
                    rows = compare(before, after, setOfNotNull(draft.id, replaced?.id)),
                )
            }!!
            store.finish(id, result)
            log.info("backtest {}: stored {} rows", id, result.rows.size)
        } catch (e: Exception) {
            log.warn("backtest {} failed", id, e)
            store.fail(id, e.message ?: e.javaClass.simpleName)
        }
    }

    /** The transactions in [period] whose case people decided as [status] in the current production run. */
    private fun closedAs(status: Int, period: Period): Set<String> =
        jdbc.sql(
            """
            select a.transaction_id
            from alert a join transaction t on t.id = a.transaction_id
            where a.run_id = (select max(id) from run where finished_at is not null) and t.ts >= ? and t.ts < ?
            group by a.transaction_id
            -- A case's status is its most advanced alert's: NEW < FALSE_POSITIVE < ESCALATED < REPORTED.
            having max(array_position(array['NEW','FALSE_POSITIVE','ESCALATED','REPORTED'], a.status)) = ?
            """,
        ).params(period.from, period.toExclusive, status).query { rs, _ -> rs.getString(1) }.set()

    /**
     * The run's cases in [period], as the review queue lists them: a transaction an alert points at, rated by the most
     * severe disposition of its alerts, unless triage closed them all; with the rules whose hits its alerts hold.
     */
    private fun cases(runId: Long, period: Period): Map<String, Case> =
        jdbc.sql(
            """
            select t.id, t.client_id, t.amount, t.ts, ($DISPOSITIONS)[c.level] as disposition, c.rules
            from (
                select a.transaction_id, max(array_position($DISPOSITIONS, tr.disposition)) as level,
                       array_agg(distinct h.rule_id) as rules
                from alert a
                join alert_triage tr on tr.alert_id = a.id
                join alert_hit ah on ah.alert_id = a.id join rule_hit h on h.id = ah.hit_id
                where a.run_id = ? and a.transaction_id is not null
                group by a.transaction_id
            ) c join transaction t on t.id = c.transaction_id
            where t.ts >= ? and t.ts < ? and c.level > 1
            """,
        ).params(runId, period.from, period.toExclusive).query { rs, _ ->
            Case(
                id = rs.getString("id"),
                clientId = rs.getString("client_id"),
                amount = rs.getDouble("amount"),
                ts = rs.getObject("ts", LocalDateTime::class.java),
                rating = ratingOf(rs.getString("disposition")),
                rules = (rs.getArray("rules").array as Array<*>).map { (it as Number).toLong() }.toSet(),
            )
        }.list().associateBy { it.id }

    /**
     * Every case of the period, before and after; unchanged ones too, last. A change is the rule's own when the case
     * holds a hit of the rule ([ruleIds]: the draft and the version it replaces); it came through triage when it holds
     * none, or holds other rules' hits too, which weigh in its rating.
     */
    private fun compare(before: Map<String, Case>, after: Map<String, Case>, ruleIds: Set<Long>): List<BacktestRow> =
        (before.keys + after.keys).map { id ->
            val b = before[id]
            val a = after[id]
            val shown = (a ?: b)!!
            val change = when {
                b?.rating == a?.rating -> "UNCHANGED"
                b == null -> "NEW"
                a == null -> "DROPPED"
                RANK.getValue(a.rating) > RANK.getValue(b.rating) -> "RAISED"
                else -> "LOWERED"
            }
            val changed = change != "UNCHANGED"
            val rules = b?.rules.orEmpty() + a?.rules.orEmpty()
            val byRule = changed && rules.any { it in ruleIds }
            val byTriage = changed && (!byRule || rules.any { it !in ruleIds })
            BacktestRow(shown.id, shown.clientId, shown.amount, shown.ts, b?.rating, a?.rating, change, byRule, byTriage)
        }.sortedWith(
            compareBy<BacktestRow> { ORDER.getValue(it.change) }
                .thenByDescending { RANK[it.after ?: it.before] ?: 0 }
                .thenBy { it.ts },
        )

    private data class Case(
        val id: String,
        val clientId: String,
        val amount: Double,
        val ts: LocalDateTime,
        val rating: String,
        val rules: Set<Long>,
    )

    private companion object {
        val RANK = mapOf("Low" to 1, "Medium" to 2, "High" to 3)
        val ORDER = mapOf("NEW" to 0, "RAISED" to 1, "LOWERED" to 2, "DROPPED" to 3, "UNCHANGED" to 4)

        /** A case's status by its place in NEW < FALSE_POSITIVE < ESCALATED < REPORTED. */
        const val FALSE_POSITIVE = 2
        const val REPORTED = 4

        /** Triage dispositions, least to most severe; 1 (`AUTO_CLOSE`) closes the alert. */
        const val DISPOSITIONS = "array['AUTO_CLOSE','REVIEW_LOW','REVIEW_MEDIUM','REVIEW_HIGH','ESCALATE']"

        fun ratingOf(disposition: String) = when (disposition) {
            "ESCALATE", "REVIEW_HIGH" -> "High"
            "REVIEW_MEDIUM" -> "Medium"
            else -> "Low"
        }

        /** Two versions take the same place in the rule set: one key, one scope. */
        fun RuleDefinition.sameSlot(other: RuleDefinition) =
            key == other.key && scopeSegmentId == other.scopeSegmentId && scopeClientId == other.scopeClientId
    }
}
