package cz.morosystems.aml.engine.rules

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

/** Backtests and their rows, kept apart from production runs: the latest one only, gone with its draft or its approval. */
@Repository
class BacktestRepository(private val jdbc: JdbcClient) {

    /** Deletes every stored backtest and records a RUNNING one for [summary]'s draft; returns its id. */
    @Transactional
    fun start(summary: Backtest, userId: Long?): Long {
        jdbc.sql("delete from backtest").update()
        return jdbc.sql(
            """
            insert into backtest (rule_id, rule_key, rule_name, draft_version, active_version, from_date, to_date, created_by)
            values (?, ?, ?, ?, ?, ?, ?, ?) returning id
            """,
        ).params(
            listOf(
                summary.draftId, summary.ruleKey, summary.ruleName, summary.draftVersion, summary.activeVersion,
                summary.from, summary.to, userId,
            ),
        ).query(Long::class.java).single()
    }

    /** Stores the result of backtest [id]; does nothing when it was deleted meanwhile (a newer backtest, its draft gone). */
    @Transactional
    fun finish(id: Long, result: BacktestResult) {
        val rows = result.rows
        val updated = jdbc.sql(
            """
            update backtest set status = 'DONE', transactions = ?, new_count = ?, dropped_count = ?, changed_count = ?, unchanged_count = ?,
                                false_positives = ?, false_positives_cleared = ?, reported = ?, false_negatives = ?
            where id = ? and status = 'RUNNING'
            """,
        ).params(
            result.transactions,
            rows.count { it.change == "NEW" },
            rows.count { it.change == "DROPPED" },
            rows.count { it.change == "RAISED" || it.change == "LOWERED" },
            rows.count { it.change == "UNCHANGED" },
            result.falsePositives,
            result.falsePositivesCleared,
            result.reported,
            result.falseNegatives,
            id,
        ).update()
        if (updated == 0) return
        rows.withIndex().chunked(BATCH).forEach { chunk ->
            val values = List(chunk.size) { "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" }.joinToString(", ")
            jdbc.sql("insert into backtest_row (backtest_id, position, transaction_id, client_id, amount, ts, before_rating, after_rating, change, by_rule, by_triage) values $values")
                .params(chunk.flatMap { (i, r) -> listOf(id, i, r.id, r.clientId, r.amount, r.ts, r.before, r.after, r.change, r.byRule, r.byTriage) })
                .update()
        }
    }

    fun fail(id: Long, error: String) {
        jdbc.sql("update backtest set status = 'FAILED', error = ? where id = ? and status = 'RUNNING'").params(error, id).update()
    }

    /** A backtest that was running when the engine stopped will never finish: mark it failed. */
    fun failInterrupted() {
        jdbc.sql("update backtest set status = 'FAILED', error = 'the engine stopped during the backtest' where status = 'RUNNING'").update()
    }

    fun summary(draftId: Long): Backtest? =
        jdbc.sql(
            """
            select b.*, (select count(*) from backtest_row r where r.backtest_id = b.id and r.after_rating is not null) as alerts
            from backtest b where b.rule_id = ?
            """,
        ).param(draftId).query { rs, _ ->
            Backtest(
                ruleKey = rs.getString("rule_key"),
                ruleName = rs.getString("rule_name"),
                draftId = rs.getLong("rule_id"),
                draftVersion = rs.getInt("draft_version"),
                activeVersion = rs.getObject("active_version") as Int?,
                from = rs.getObject("from_date", LocalDate::class.java),
                to = rs.getObject("to_date", LocalDate::class.java),
                status = rs.getString("status"),
                error = rs.getString("error"),
                transactions = rs.getInt("transactions"),
                newCount = rs.getInt("new_count"),
                droppedCount = rs.getInt("dropped_count"),
                changedCount = rs.getInt("changed_count"),
                unchangedCount = rs.getInt("unchanged_count"),
                alerts = rs.getInt("alerts"),
                falsePositives = rs.getInt("false_positives"),
                falsePositivesCleared = rs.getInt("false_positives_cleared"),
                reported = rs.getInt("reported"),
                falseNegatives = rs.getInt("false_negatives"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            )
        }.optional().orElse(null)

    /** A page of the draft's rows in [view]; null when the draft has no backtest. */
    fun rows(draftId: Long, view: String, page: Int, size: Int): BacktestRows? {
        val id = jdbc.sql("select id from backtest where rule_id = ?").param(draftId).query(Long::class.java).optional().orElse(null)
            ?: return null
        val where = "backtest_id = :id and " + VIEWS.getValue(view)
        val total = jdbc.sql("select count(*) from backtest_row where $where").param("id", id).query(Int::class.java).single()
        val items = jdbc.sql("select * from backtest_row where $where order by position limit :limit offset :offset")
            .param("id", id).param("limit", size).param("offset", page.toLong() * size)
            .query { rs, _ ->
                BacktestRow(
                    id = rs.getString("transaction_id"),
                    clientId = rs.getString("client_id"),
                    amount = rs.getDouble("amount"),
                    ts = rs.getObject("ts", LocalDateTime::class.java),
                    before = rs.getString("before_rating"),
                    after = rs.getString("after_rating"),
                    change = rs.getString("change"),
                    byRule = rs.getBoolean("by_rule"),
                    byTriage = rs.getBoolean("by_triage"),
                )
            }.list()
        return BacktestRows(items, page, size, total)
    }

    companion object {
        private const val BATCH = 2000

        /** The row views the page offers, as SQL conditions. */
        val VIEWS = mapOf(
            // Every transaction the draft leaves with an open alert: what the queue would hold.
            "all" to "after_rating is not null",
            "changed" to "change in ('RAISED', 'LOWERED')",
            "new" to "change = 'NEW'",
            "dropped" to "change = 'DROPPED'",
        )
    }
}
