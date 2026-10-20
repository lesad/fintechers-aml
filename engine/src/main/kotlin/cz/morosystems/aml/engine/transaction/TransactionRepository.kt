package cz.morosystems.aml.engine.transaction

import cz.morosystems.aml.engine.assessment.AssessmentService
import cz.morosystems.aml.engine.user.AppUser
import java.sql.ResultSet
import java.sql.Types
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper

@Repository
class TransactionRepository(private val jdbc: JdbcClient) {
    private val json = JsonMapper()

    /**
     * Sets the status of the transaction's alerts in the latest finished run and who set it, hands an escalated
     * case to the manager, and logs the decision with its reason; false when the transaction has no alert there.
     */
    fun setStatus(id: String, status: String, userId: Long, reason: String, postponed: Boolean? = null): Boolean =
        jdbc.sql(
            """
            with changed as (
                update alert set status = :status, status_by = :user,
                    assignee_id = case when :status = 'ESCALATED'
                        then (select min(id) from app_user where role = 'MANAGER') else assignee_id end
                where transaction_id = :tx and run_id = ($LATEST_RUN)
                returning run_id, assignee_id
            )
            insert into case_event (run_id, transaction_id, actor_id, action, reason, assignee_id, postponed)
            select run_id, :tx, :user, :status, :reason, max(assignee_id), :postponed from changed group by run_id
            """,
        ).params(mapOf("status" to status, "user" to userId, "tx" to id, "reason" to reason))
            .param("postponed", postponed, Types.BOOLEAN).update() > 0

    /** The case's status in the latest run, the most advanced of its alerts' as in the queue; null when it has no alert there. */
    fun caseStatus(id: String): String? =
        jdbc.sql("select status from alert where transaction_id = ? and run_id = ($LATEST_RUN)").param(id)
            .query(String::class.java).list().maxByOrNull { STATUSES.indexOf(it) }

    /** Hands the case to [assigneeId] on behalf of [userId] and logs it; false when the transaction has no alert in the latest run. */
    fun assign(id: String, assigneeId: Long, userId: Long): Boolean =
        jdbc.sql(
            """
            with changed as (
                update alert set assignee_id = :assignee
                where transaction_id = :tx and run_id = ($LATEST_RUN)
                returning run_id
            )
            insert into case_event (run_id, transaction_id, actor_id, action, assignee_id)
            select distinct run_id, :tx, :user, 'REASSIGNED', :assignee from changed
            """,
        ).params(mapOf("assignee" to assigneeId, "tx" to id, "user" to userId)).update() > 0

    /** Who works the transaction's case in the latest run; null when nobody was assigned or it has no alert there. */
    private fun assignee(transactionId: String): AppUser? =
        jdbc.sql(
            """
            select u.id, u.name, u.role from alert a join app_user u on u.id = a.assignee_id
            where a.transaction_id = ? and a.run_id = ($LATEST_RUN) order by a.id limit 1
            """,
        ).param(transactionId).query { rs, _ -> AppUser(rs.getLong("id"), rs.getString("name"), rs.getString("role")) }
            .optional().orElse(null)

    /** The case's decision log in the latest run, newest first. */
    private fun log(transactionId: String): List<CaseEvent> =
        jdbc.sql(
            """
            select e.at, e.action, e.reason, e.postponed, actor.name as actor, assignee.name as assignee
            from case_event e
            left join app_user actor on actor.id = e.actor_id
            left join app_user assignee on assignee.id = e.assignee_id
            where e.transaction_id = ? and e.run_id = ($LATEST_RUN)
            order by e.at desc, e.id desc
            """,
        ).param(transactionId).query { rs, _ ->
            CaseEvent(
                at = rs.getObject("at", OffsetDateTime::class.java),
                action = rs.getString("action"),
                actor = rs.getString("actor"),
                reason = rs.getString("reason"),
                assignee = rs.getString("assignee"),
                postponed = rs.getBoolean("postponed").takeUnless { rs.wasNull() },
            )
        }.list()

    /**
     * The review queue: transactions the latest finished run alerted on and triage did not close on its own,
     * reported last, then most severe disposition first, then highest score. `statuses` keeps a transaction whose
     * case status is one of them; empty keeps all. [assignee] keeps only that user's cases, in the counts too;
     * null keeps all. [ai] keeps only transactions with a ready AI Rating on one of their alerts (a temporary demo switch).
     */
    fun flagged(query: String?, rating: String?, statuses: List<String>, assignee: Long?, page: Int, size: Int, ai: Boolean = false): TransactionPage {
        val mine = "(:assignee = 0 or q.assignee_id = :assignee)"
        val filter = """
            where $mine
              and (:q = '' or q.id ilike :like or t.client_id ilike :like)
              and (:rating = '' or q.rating = :rating)
              and (:statuses = '' or q.status = any(string_to_array(:statuses, ',')))
              and (not :ai or exists (
                  select 1 from alert a join ai_result r on r.alert_id = a.id
                  where a.transaction_id = q.id and a.run_id = ($LATEST_RUN) and r.kind = 'assessment' and r.status = 'ready'
              ))
        """
        val q = query?.trim().orEmpty()
        val params = mapOf("q" to q, "like" to "%$q%", "rating" to rating.orEmpty(), "statuses" to statuses.joinToString(","), "assignee" to (assignee ?: 0L), "ai" to ai)

        val items = jdbc.sql(
            """
            $QUEUE
            select q.id, t.client_id, t.ts, t.amount, t.volume, t.currency, t.direction,
                   q.alert_types, q.rules, q.rule_names, q.flagged_at, q.rating, q.disposition, q.score, q.status
            from queue q join transaction t on t.id = q.id
            $filter
            order by q.status = 'REPORTED', q.sev desc, q.score desc, q.id
            limit :limit offset :offset
            """,
        ).params(params + mapOf("limit" to size, "offset" to page.toLong() * size)).query { rs, _ ->
            FlaggedTransaction(
                id = rs.getString("id"),
                clientId = rs.getString("client_id"),
                ts = rs.getObject("ts", LocalDateTime::class.java),
                amount = rs.getDouble("amount"),
                volume = rs.getBigDecimal("volume"),
                currency = rs.getString("currency"),
                direction = rs.getString("direction"),
                alertTypes = rs.strings("alert_types"),
                rules = rs.strings("rules").zip(rs.strings("rule_names"), ::RuleRef),
                rating = rs.getString("rating"),
                disposition = rs.getString("disposition"),
                status = rs.getString("status"),
                score = rs.getInt("score"),
                flaggedAt = rs.getObject("flagged_at", OffsetDateTime::class.java),
            )
        }.list().let { rows ->
            val aiRatings = aiRatings(rows.map(FlaggedTransaction::id))
            rows.map { it.copy(aiRating = aiRatings[it.id]) }
        }

        val total = jdbc.sql("$QUEUE select count(*) from queue q join transaction t on t.id = q.id $filter")
            .params(params).query(Long::class.java).single()

        val counts = jdbc.sql("$QUEUE select q.rating, count(*) as n from queue q where $mine group by 1")
            .param("assignee", assignee ?: 0L).query { rs, _ -> rs.getString("rating") to rs.getLong("n") }.list().toMap()

        return TransactionPage(items, page, size, total, RATINGS.associateWith { counts[it] ?: 0L })
    }

    /** The AI Rating per transaction: that of its most severe alert, when its newest result is ready, whatever prompt made it (ADR-0045). */
    private fun aiRatings(ids: List<String>): Map<String, String?> =
        jdbc.sql(
            """
            select distinct on (a.transaction_id) a.transaction_id, r.status, r.body->>'rating' as rating
            from alert a
            join alert_triage tr on tr.alert_id = a.id
            left join lateral (
                select status, body from ai_result
                where alert_id = a.id and kind = ? order by id desc limit 1
            ) r on true
            where a.run_id = ($LATEST_RUN) and a.transaction_id = any(?)
            order by a.transaction_id, array_position(?::text[], tr.disposition) desc, a.id
            """,
        ).params(
            AssessmentService.KIND.name, ids.toTypedArray(), DISPOSITIONS.toTypedArray(),
        ).query { rs, _ ->
            rs.getString("transaction_id") to rs.getString("rating")?.takeIf { rs.getString("status") == "ready" }?.replaceFirstChar(Char::uppercase)
        }.list().toMap()

    fun detail(id: String): TransactionDetail? {
        val tx = jdbc.sql(
            """
            select id, client_id, ts, amount, volume, currency, fx_rate, direction, type,
                   payer_account, payer_country, payee_account, payee_country
            from transaction where id = ?
            """,
        ).param(id).query { rs, _ ->
            Transaction(
                id = rs.getString("id"),
                clientId = rs.getString("client_id"),
                ts = rs.getObject("ts", LocalDateTime::class.java),
                amount = rs.getDouble("amount"),
                volume = rs.getBigDecimal("volume"),
                currency = rs.getString("currency"),
                fxRate = rs.getBigDecimal("fx_rate"),
                direction = rs.getString("direction"),
                type = rs.getString("type"),
                payerAccount = rs.getString("payer_account")?.ifBlank { null },
                payerCountry = rs.getString("payer_country"),
                payeeAccount = rs.getString("payee_account")?.ifBlank { null },
                payeeCountry = rs.getString("payee_country"),
            )
        }.optional().orElse(null) ?: return null

        val client = jdbc.sql(
            """
            select id, country, contract_date, channel, pep, type, risk, expected_monthly_volume, expected_count,
                   q2_volume, q2_tx_count, q2_max_tx, q2_days
            from client where id = ?
            """,
        ).param(tx.clientId).query { rs, _ ->
            Client(
                id = rs.getString("id"),
                country = rs.getString("country"),
                contractDate = rs.getObject("contract_date", LocalDate::class.java),
                channel = rs.getString("channel"),
                pep = rs.getBoolean("pep"),
                type = rs.getString("type"),
                risk = rs.getString("risk"),
                expectedMonthly = rs.getDouble("expected_monthly_volume"),
                expectedCount = rs.getInt("expected_count"),
                q2Volume = rs.getDouble("q2_volume"),
                q2TxCount = rs.getInt("q2_tx_count"),
                q2MaxTx = rs.getDouble("q2_max_tx"),
                q2Days = rs.getInt("q2_days"),
            )
        }.single()

        val alerts = alerts(id)
        val worst = alerts.mapNotNull { it.triage?.disposition }.maxByOrNull { DISPOSITIONS.indexOf(it) }
        val status = alerts.map { it.status }.maxByOrNull { STATUSES.indexOf(it) }
        val historyCount = jdbc.sql("select count(*) from transaction where client_id = ?").param(client.id)
            .query(Int::class.java).single()
        return TransactionDetail(
            tx, client, worst?.let(::ratingOf), worst, status, assignee(id), log(id), alerts, day(client.id, tx.ts), historyCount,
        )
    }

    private fun alerts(transactionId: String): List<TransactionAlert> {
        val alerts = jdbc.sql(
            """
            select a.id, a.alert_type, a.status, a.created_at,
                   tr.disposition, tr.score, tr.reasons::text as reasons, tr.config_version, tr.decided_at
            from alert a left join alert_triage tr on tr.alert_id = a.id
            where a.run_id = ($LATEST_RUN) and a.transaction_id = ? order by a.id
            """,
        ).param(transactionId).query { rs, _ ->
            val triage = rs.getString("disposition")?.let { disposition ->
                AlertTriage(
                    disposition = disposition,
                    score = rs.getInt("score"),
                    reasons = reasons(rs.getString("reasons")),
                    configVersion = rs.getString("config_version"),
                    decidedAt = rs.getObject("decided_at", OffsetDateTime::class.java),
                )
            }
            AlertRow(rs.getLong("id"), rs.getString("alert_type"), rs.getString("status"), rs.getObject("created_at", OffsetDateTime::class.java), triage)
        }.list()
        return alerts.map { row ->
            val hits = jdbc.sql(
                """
                select r.key, coalesce(r.name, r.key) as name, r.version, h.grain_key, h.evidence::text as evidence
                from alert_hit ah join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
                where ah.alert_id = ? order by r.key, h.grain_key
                """,
            ).param(row.id).query { rs, _ ->
                @Suppress("UNCHECKED_CAST") // evidence is a JSON object written by RunService
                val evidence = rs.getString("evidence")?.let { json.readValue(it, Map::class.java) as Map<String, Any?> } ?: emptyMap()
                Hit(rs.getString("key"), rs.getString("name"), rs.getInt("version"), rs.getString("grain_key"), evidence)
            }.list()
            TransactionAlert(row.id, row.type, row.createdAt, row.triage, row.triage?.let { ratingOf(it.disposition) }, row.status, hits)
        }
    }

    @Suppress("UNCHECKED_CAST") // reasons is a JSON array of {code, description, points} written by TriageRepository
    private fun reasons(text: String?): List<TriageReason> =
        (text?.let { json.readValue(it, List::class.java) as List<Map<String, Any?>> } ?: emptyList()).map {
            TriageReason(it["code"] as String, it["description"] as String, (it["points"] as Number).toInt())
        }

    /**
     * Up to [limit] of the client's transactions right before (`older`) or after (`newer`) transaction [id],
     * newest first, and whether more lie beyond them. Null for an unknown transaction.
     */
    fun history(id: String, older: Boolean, limit: Int): HistoryPage? {
        val anchor = jdbc.sql("select client_id, ts from transaction where id = ?").param(id)
            .query { rs, _ -> rs.getString("client_id") to rs.getObject("ts", LocalDateTime::class.java) }
            .optional().orElse(null) ?: return null
        val rows = historyRows(
            if (older) "(t.ts, t.id) < (:ts, :id) order by t.ts desc, t.id desc" else "(t.ts, t.id) > (:ts, :id) order by t.ts, t.id",
            mapOf("client" to anchor.first, "ts" to anchor.second, "id" to id, "limit" to limit + 1),
        )
        val page = rows.take(limit)
        return HistoryPage(if (older) page else page.reversed(), more = rows.size > limit)
    }

    /** The client's transactions on the calendar day of [ts], newest first. */
    private fun day(clientId: String, ts: LocalDateTime): List<HistoryTransaction> =
        historyRows(
            "t.ts::date = :day order by t.ts desc, t.id desc",
            mapOf("client" to clientId, "day" to ts.toLocalDate(), "limit" to Int.MAX_VALUE),
        )

    private fun historyRows(condition: String, params: Map<String, Any>): List<HistoryTransaction> =
        jdbc.sql(
            """
            select t.id, t.ts, t.direction, t.amount,
                   case when t.direction = 'in' then t.payer_account else t.payee_account end as account,
                   case when t.direction = 'in' then t.payer_country else t.payee_country end as country,
                   coalesce(a.types, '{}') as alert_types
            from transaction t
            left join (
                select transaction_id, array_agg(distinct alert_type order by alert_type) as types
                from alert where run_id = ($LATEST_RUN) group by transaction_id
            ) a on a.transaction_id = t.id
            where t.client_id = :client and $condition
            limit :limit
            """,
        ).params(params).query { rs, _ ->
            HistoryTransaction(
                id = rs.getString("id"),
                ts = rs.getObject("ts", LocalDateTime::class.java),
                direction = rs.getString("direction"),
                counterpartyAccount = rs.getString("account")?.ifBlank { null },
                counterpartyCountry = rs.getString("country"),
                amount = rs.getDouble("amount"),
                alertTypes = rs.strings("alert_types"),
            )
        }.list()

    private fun ResultSet.strings(column: String): List<String> =
        (getArray(column).array as Array<*>).map { it as String }

    private data class AlertRow(val id: Long, val type: String, val status: String, val createdAt: OffsetDateTime, val triage: AlertTriage?)

    companion object {
        private val RATINGS = listOf("High", "Medium", "Low")

        /** Triage dispositions, mildest first, as in `triage/TriageModel.kt`. */
        val DISPOSITIONS = listOf("AUTO_CLOSE", "REVIEW_LOW", "REVIEW_MEDIUM", "REVIEW_HIGH", "ESCALATE")

        /** Alert statuses in workflow order: a case shows the most advanced one of its alerts. */
        val STATUSES = listOf("NEW", "FALSE_POSITIVE", "ESCALATED", "REPORTED")

        /** The three-level rating the UI shows. Must match the `rating` case in [QUEUE]. */
        private fun ratingOf(disposition: String): String = when (disposition) {
            "ESCALATE", "REVIEW_HIGH" -> "High"
            "REVIEW_MEDIUM" -> "Medium"
            else -> "Low"
        }

        private const val LATEST_RUN = "select max(id) from run where finished_at is not null"

        /**
         * One row per transaction the latest run alerted on: its most severe triage disposition (`sev`, the
         * 1-based position in the disposition list), highest score, alert types and the rules that fired.
         * Transactions that triage closed on its own (`AUTO_CLOSE`) are left out, as no one needs to review them;
         * an alert not triaged yet is left out too.
         */
        private const val QUEUE = """
            with alert_sev as (
                select a.id, a.transaction_id, a.alert_type, a.status, a.assignee_id, a.created_at, tr.score,
                       array_position(array['AUTO_CLOSE','REVIEW_LOW','REVIEW_MEDIUM','REVIEW_HIGH','ESCALATE'], tr.disposition) as sev
                from alert a join alert_triage tr on tr.alert_id = a.id
                where a.run_id = ($LATEST_RUN) and a.transaction_id is not null
            ), per_tx as (
                select transaction_id as id,
                       array_agg(distinct alert_type order by alert_type) as alert_types,
                       array_agg(id) as alert_ids,
                       array_agg(distinct status) as statuses,
                       (array['NEW','FALSE_POSITIVE','ESCALATED','REPORTED'])[
                           max(array_position(array['NEW','FALSE_POSITIVE','ESCALATED','REPORTED'], status))
                       ] as status,
                       max(sev) as sev, max(score) as score, min(created_at) as flagged_at, max(assignee_id) as assignee_id
                from alert_sev group by transaction_id
            ), queue as (
                select p.id, p.alert_types, p.statuses, p.status, p.sev, p.score, p.flagged_at, p.assignee_id,
                       coalesce(rk.rules, '{}') as rules, coalesce(rk.rule_names, '{}') as rule_names,
                       (array['AUTO_CLOSE','REVIEW_LOW','REVIEW_MEDIUM','REVIEW_HIGH','ESCALATE'])[p.sev] as disposition,
                       (case when p.sev >= 4 then 'High' when p.sev = 3 then 'Medium' else 'Low' end) as rating
                from per_tx p
                left join lateral (
                    select array_agg(k order by k) as rules, array_agg(n order by k) as rule_names
                    from (
                        select distinct on (r.key) r.key as k, coalesce(r.name, r.key) as n
                        from alert_hit ah join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
                        where ah.alert_id = any(p.alert_ids)
                        order by r.key, r.version desc
                    ) fired
                ) rk on true
                where p.sev > 1
            )
        """
    }
}
