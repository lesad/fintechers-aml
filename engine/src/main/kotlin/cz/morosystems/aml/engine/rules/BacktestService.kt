package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.run.RunService
import cz.morosystems.aml.engine.sql.Period
import java.sql.ResultSet
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
    /** Why, when it is not plain: the rule that no longer fires, the rules that still flag it. */
    val note: String?,
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
    val createdAt: OffsetDateTime?,
)

/** One page of a backtest's rows, in the backtest's order, and how many rows the view has in all. */
data class BacktestRows(val items: List<BacktestRow>, val page: Int, val size: Int, val total: Int)

/**
 * Replays a period with a draft rule version: the rules run once as they are active and once with the draft in
 * place of its active version (or added, for a new rule), each with triage, and the two are compared per
 * transaction. Both runs are rolled back, so no production run, alert or case is left; the comparison is stored
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

    /** A page of the stored rows in one view: `all`, `changed` (anything but unchanged), `new` or `dropped`. */
    fun rows(draftId: Long, view: String, page: Int, size: Int): BacktestRows? = store.rows(draftId, view, page, size)

    private fun compute(id: Long, draft: RuleDefinition, period: Period) {
        try {
            val (transactions, rows) = rollback.execute { status ->
                status.setRollbackOnly()
                val active = rules.activeRules()
                val before = cases(runs.run(period, active, export = false).runId, period)
                val after = cases(runs.run(period, active.filterNot { it.sameSlot(draft) } + draft, export = false).runId, period)
                val count = jdbc.sql("select count(*) from transaction where ts >= ? and ts < ?")
                    .params(period.from, period.toExclusive).query(Int::class.java).single()
                count to compare(before, after, draft.key)
            }!!
            store.finish(id, transactions, rows)
        } catch (e: Exception) {
            log.warn("backtest {} failed", id, e)
            store.fail(id, e.message ?: e.javaClass.simpleName)
        }
    }

    /** A case per transaction in [period] that the run flagged (triage did not close it), with its rating and rules. */
    private fun cases(runId: Long, period: Period): Map<String, Case> =
        jdbc.sql(
            """
            select t.id, t.client_id, t.amount, t.ts, c.disposition, c.rules
            from (
                select a.transaction_id,
                       (array['AUTO_CLOSE','REVIEW_LOW','REVIEW_MEDIUM','REVIEW_HIGH','ESCALATE'])[
                           max(array_position(array['AUTO_CLOSE','REVIEW_LOW','REVIEW_MEDIUM','REVIEW_HIGH','ESCALATE'], tr.disposition))
                       ] as disposition,
                       array_agg(distinct r.key order by r.key) as rules
                from alert a
                join alert_triage tr on tr.alert_id = a.id
                join alert_hit ah on ah.alert_id = a.id join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
                where a.run_id = ? and a.transaction_id is not null
                group by a.transaction_id
            ) c join transaction t on t.id = c.transaction_id
            where t.ts >= ? and t.ts < ? and c.disposition <> 'AUTO_CLOSE'
            """,
        ).params(runId, period.from, period.toExclusive).query { rs, _ -> case(rs) }.list().associateBy { it.id }

    private fun case(rs: ResultSet) = Case(
        id = rs.getString("id"),
        clientId = rs.getString("client_id"),
        amount = rs.getDouble("amount"),
        ts = rs.getObject("ts", LocalDateTime::class.java),
        rating = ratingOf(rs.getString("disposition")),
        rules = (rs.getArray("rules").array as Array<*>).map { it as String },
    )

    private fun compare(before: Map<String, Case>, after: Map<String, Case>, key: String): List<BacktestRow> =
        (before.keys + after.keys).map { id ->
            val b = before[id]
            val a = after[id]
            val shown = (a ?: b)!!
            val change = when {
                b == null -> "NEW"
                a == null -> "DROPPED"
                RANK.getValue(a.rating) > RANK.getValue(b.rating) -> "RAISED"
                RANK.getValue(a.rating) < RANK.getValue(b.rating) -> "LOWERED"
                else -> "UNCHANGED"
            }
            val note = when {
                b == null -> "not flagged with the active rules"
                key in b.rules && (a == null || key !in a.rules) ->
                    if (a == null) "$key no longer fires" else "$key no longer fires; still flagged by ${a.rules.joinToString(", ")}"
                else -> null
            }
            BacktestRow(shown.id, shown.clientId, shown.amount, shown.ts, b?.rating, a?.rating, change, note)
        }.sortedWith(
            compareBy<BacktestRow> { ORDER.getValue(it.change) }
                .thenByDescending { RANK[it.after ?: it.before] ?: 0 }
                .thenBy { it.ts },
        )

    private data class Case(val id: String, val clientId: String, val amount: Double, val ts: LocalDateTime, val rating: String, val rules: List<String>)

    private companion object {
        val RANK = mapOf("Low" to 1, "Medium" to 2, "High" to 3)
        val ORDER = mapOf("NEW" to 0, "RAISED" to 1, "LOWERED" to 2, "DROPPED" to 3, "UNCHANGED" to 4)

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
