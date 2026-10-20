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
 * a production run does, and every transaction of the period is compared before and after. Both runs are rolled back, so no production run, alert or case is left; the comparison is stored
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

    /** A page of the stored rows in one view: `all`, `changed` (rating raised or lowered), `new` or `dropped`. */
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
                // Both runs cover all the data, as a production run does; only the period's transactions are compared.
                val replaced = active.firstOrNull { it.sameSlot(draft) }
                val beforeRun = runs.run(ruleSet = active, export = false).runId
                log.info("backtest {}: active rules run at {}", id, took())
                val before = ratings(beforeRun, period)
                val afterRun = runs.run(ruleSet = active.filterNot { it.sameSlot(draft) } + draft, export = false).runId
                log.info("backtest {}: draft run at {}", id, took())
                val after = ratings(afterRun, period)
                // The transactions the rule itself is about, as the draft or as the version it replaces.
                val direct = hitBy(afterRun, draft.id, period) + (replaced?.let { hitBy(beforeRun, it.id, period) } ?: emptySet())
                val transactions = transactions(period)
                log.info("backtest {}: compared at {}", id, took())
                BacktestResult(
                    transactions = transactions.size,
                    falsePositives = falsePositives.size,
                    falsePositivesCleared = falsePositives.count { it !in after },
                    reported = reported.size,
                    falseNegatives = reported.count { it !in after },
                    rows = compare(transactions, before, after, direct),
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
     * The rating of every transaction in [period] that belongs to an alert of the run triage left open: a transaction
     * a hit was about (the transaction, the anchor, or every transaction of the client's day) or the alert points at.
     * A transaction in several alerts takes the highest rating; it is [Rating.grouped] when one of them holds other
     * transactions too, whose hits weigh in that alert's triage.
     */
    private fun ratings(runId: Long, period: Period): Map<String, Rating> =
        jdbc.sql(
            """
            with open as (
                select a.id, a.transaction_id, max(array_position($DISPOSITIONS, tr.disposition)) as level
                from alert a join alert_triage tr on tr.alert_id = a.id
                where a.run_id = ?
                group by a.id, a.transaction_id
                having max(array_position($DISPOSITIONS, tr.disposition)) > 1
            ), linked as (
                select o.id as alert_id, o.level, o.transaction_id as tx_id from open o where o.transaction_id is not null
                union all
                select o.id, o.level, h.grain_key
                from open o join alert_hit ah on ah.alert_id = o.id join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
                where r.grain <> 'client_day'
                union all
                select o.id, o.level, t.id
                from open o join alert_hit ah on ah.alert_id = o.id join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
                join transaction t on t.client_id = h.client_id
                    -- grain_key is a date only for a day hit; the case keeps the cast from other hits' keys.
                    and t.ts >= (case when r.grain = 'client_day' then h.grain_key::date end)
                    and t.ts < (case when r.grain = 'client_day' then h.grain_key::date + 1 end)
                where r.grain = 'client_day'
            ), grouped as (
                select alert_id, count(distinct tx_id) > 1 as grouped from linked group by alert_id
            )
            select l.tx_id, ($DISPOSITIONS)[max(l.level)] as disposition, bool_or(g.grouped) as grouped
            from linked l join grouped g using (alert_id) join transaction t on t.id = l.tx_id
            where t.ts >= ? and t.ts < ?
            group by l.tx_id
            """,
        ).params(runId, period.from, period.toExclusive)
            .query { rs, _ -> rs.getString("tx_id") to Rating(ratingOf(rs.getString("disposition")), rs.getBoolean("grouped")) }
            .list().toMap()

    /** The transactions in [period] the rule version [ruleId] hit in the run: its own, its anchor, or its day's. */
    private fun hitBy(runId: Long, ruleId: Long, period: Period): Set<String> =
        jdbc.sql(
            """
            select t.id
            from rule_hit h join rule r on r.id = h.rule_id
            join transaction t on (r.grain <> 'client_day' and t.id = h.grain_key)
                or (r.grain = 'client_day' and t.client_id = h.client_id
                    -- grain_key is a date only for a day hit; the case keeps the cast from other hits' keys.
                    and t.ts >= (case when r.grain = 'client_day' then h.grain_key::date end)
                    and t.ts < (case when r.grain = 'client_day' then h.grain_key::date + 1 end))
            where h.run_id = ? and h.rule_id = ? and t.ts >= ? and t.ts < ?
            """,
        ).params(runId, ruleId, period.from, period.toExclusive).query { rs, _ -> rs.getString(1) }.set()

    private fun transactions(period: Period): List<Tx> =
        jdbc.sql("select id, client_id, amount, ts from transaction where ts >= ? and ts < ?")
            .params(period.from, period.toExclusive)
            .query { rs, _ -> Tx(rs.getString("id"), rs.getString("client_id"), rs.getDouble("amount"), rs.getObject("ts", LocalDateTime::class.java)) }
            .list()

    /**
     * Every transaction of the period, before and after; unchanged ones too, last. A change is the rule's own when
     * the rule is about the transaction ([direct]); it came through triage when the rule is not, or when the
     * transaction's alert holds other transactions whose hits weigh in its rating too.
     */
    private fun compare(transactions: List<Tx>, before: Map<String, Rating>, after: Map<String, Rating>, direct: Set<String>): List<BacktestRow> =
        transactions.map { tx ->
            val b = before[tx.id]?.rating
            val a = after[tx.id]?.rating
            val change = when {
                b == a -> "UNCHANGED"
                b == null -> "NEW"
                a == null -> "DROPPED"
                RANK.getValue(a) > RANK.getValue(b) -> "RAISED"
                else -> "LOWERED"
            }
            val changed = change != "UNCHANGED"
            val byRule = changed && tx.id in direct
            val grouped = before[tx.id]?.grouped == true || after[tx.id]?.grouped == true
            BacktestRow(tx.id, tx.clientId, tx.amount, tx.ts, b, a, change, byRule, changed && (!byRule || grouped))
        }.sortedWith(
            compareBy<BacktestRow> { ORDER.getValue(it.change) }
                .thenByDescending { RANK[it.after ?: it.before] ?: 0 }
                .thenBy { it.ts },
        )

    private data class Tx(val id: String, val clientId: String, val amount: Double, val ts: LocalDateTime)

    private data class Rating(val rating: String, val grouped: Boolean)

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
