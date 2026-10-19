package cz.morosystems.aml.engine.transaction

import java.sql.ResultSet
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
     * The review queue: transactions the latest finished run alerted on and triage did not close on its own,
     * most severe disposition first, then highest score. `statuses` keeps a transaction when any of its alerts
     * has one of them; empty keeps all.
     */
    fun flagged(query: String?, rating: String?, statuses: List<String>, page: Int, size: Int): TransactionPage {
        val filter = """
            where (:q = '' or q.id ilike :like or t.client_id ilike :like)
              and (:rating = '' or q.rating = :rating)
              and (:statuses = '' or q.statuses && string_to_array(:statuses, ','))
        """
        val q = query?.trim().orEmpty()
        val params = mapOf("q" to q, "like" to "%$q%", "rating" to rating.orEmpty(), "statuses" to statuses.joinToString(","))

        val items = jdbc.sql(
            """
            $QUEUE
            select q.id, t.client_id, t.ts, t.amount, t.volume, t.currency, t.direction,
                   q.alert_types, q.rules, q.rule_names, q.flagged_at, q.rating, q.disposition, q.score
            from queue q join transaction t on t.id = q.id
            $filter
            order by q.sev desc, q.score desc, q.id
            limit :limit offset :offset
            """,
        ).params(params + mapOf("limit" to size, "offset" to page.toLong() * size)).query { rs, _ ->
            FlaggedTransaction(
                id = rs.getString("id"),
                clientId = rs.getString("client_id"),
                ts = rs.getObject("ts", LocalDateTime::class.java),
                amountHalere = rs.getLong("amount"),
                volume = rs.getBigDecimal("volume"),
                currency = rs.getString("currency"),
                direction = rs.getString("direction"),
                alertTypes = rs.strings("alert_types"),
                rules = rs.strings("rules").zip(rs.strings("rule_names"), ::RuleRef),
                rating = rs.getString("rating"),
                disposition = rs.getString("disposition"),
                score = rs.getInt("score"),
                flaggedAt = rs.getObject("flagged_at", OffsetDateTime::class.java),
            )
        }.list()

        val total = jdbc.sql("$QUEUE select count(*) from queue q join transaction t on t.id = q.id $filter")
            .params(params).query(Long::class.java).single()

        val counts = jdbc.sql("$QUEUE select q.rating, count(*) as n from queue q group by 1")
            .query { rs, _ -> rs.getString("rating") to rs.getLong("n") }.list().toMap()

        return TransactionPage(items, page, size, total, RATINGS.associateWith { counts[it] ?: 0L })
    }

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
                amountHalere = rs.getLong("amount"),
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
                expectedMonthlyHalere = rs.getLong("expected_monthly_volume"),
                expectedCount = rs.getInt("expected_count"),
                q2VolumeHalere = rs.getLong("q2_volume"),
                q2TxCount = rs.getInt("q2_tx_count"),
                q2MaxTxHalere = rs.getLong("q2_max_tx"),
                q2Days = rs.getInt("q2_days"),
            )
        }.single()

        val alerts = alerts(id)
        val worst = alerts.mapNotNull { it.triage?.disposition }.maxByOrNull { DISPOSITIONS.indexOf(it) }
        return TransactionDetail(tx, client, worst?.let(::ratingOf), worst, alerts, history(client.id))
    }

    private fun alerts(transactionId: String): List<TransactionAlert> {
        val alerts = jdbc.sql(
            """
            select a.id, a.alert_type, a.created_at,
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
            AlertRow(rs.getLong("id"), rs.getString("alert_type"), rs.getObject("created_at", OffsetDateTime::class.java), triage)
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
            TransactionAlert(row.id, row.type, row.createdAt, row.triage, hits)
        }
    }

    @Suppress("UNCHECKED_CAST") // reasons is a JSON array of {code, description, points} written by TriageRepository
    private fun reasons(text: String?): List<TriageReason> =
        (text?.let { json.readValue(it, List::class.java) as List<Map<String, Any?>> } ?: emptyList()).map {
            TriageReason(it["code"] as String, it["description"] as String, (it["points"] as Number).toInt())
        }

    private fun history(clientId: String): List<HistoryTransaction> =
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
            where t.client_id = ?
            order by t.ts desc, t.id
            """,
        ).param(clientId).query { rs, _ ->
            HistoryTransaction(
                id = rs.getString("id"),
                ts = rs.getObject("ts", LocalDateTime::class.java),
                direction = rs.getString("direction"),
                counterpartyAccount = rs.getString("account")?.ifBlank { null },
                counterpartyCountry = rs.getString("country"),
                amountHalere = rs.getLong("amount"),
                alertTypes = rs.strings("alert_types"),
            )
        }.list()

    private fun ResultSet.strings(column: String): List<String> =
        (getArray(column).array as Array<*>).map { it as String }

    private data class AlertRow(val id: Long, val type: String, val createdAt: OffsetDateTime, val triage: AlertTriage?)

    private companion object {
        val RATINGS = listOf("High", "Medium", "Low")

        /** Triage dispositions, mildest first, as in `triage/TriageModel.kt`. */
        val DISPOSITIONS = listOf("AUTO_CLOSE", "REVIEW_LOW", "REVIEW_MEDIUM", "REVIEW_HIGH", "ESCALATE")

        /** The three-level rating the UI shows. Must match the `rating` case in [QUEUE]. */
        fun ratingOf(disposition: String): String = when (disposition) {
            "ESCALATE", "REVIEW_HIGH" -> "High"
            "REVIEW_MEDIUM" -> "Medium"
            else -> "Low"
        }

        const val LATEST_RUN = "select max(id) from run where finished_at is not null"

        /**
         * One row per transaction the latest run alerted on: its most severe triage disposition (`sev`, the
         * 1-based position in the disposition list), highest score, alert types and the rules that fired.
         * Transactions that triage closed on its own (`AUTO_CLOSE`) are left out, as no one needs to review them;
         * an alert not triaged yet is left out too.
         */
        const val QUEUE = """
            with alert_sev as (
                select a.id, a.transaction_id, a.alert_type, a.status, a.created_at, tr.score,
                       array_position(array['AUTO_CLOSE','REVIEW_LOW','REVIEW_MEDIUM','REVIEW_HIGH','ESCALATE'], tr.disposition) as sev
                from alert a join alert_triage tr on tr.alert_id = a.id
                where a.run_id = ($LATEST_RUN) and a.transaction_id is not null
            ), per_tx as (
                select transaction_id as id,
                       array_agg(distinct alert_type order by alert_type) as alert_types,
                       array_agg(id) as alert_ids,
                       array_agg(distinct status) as statuses,
                       max(sev) as sev, max(score) as score, min(created_at) as flagged_at
                from alert_sev group by transaction_id
            ), queue as (
                select p.id, p.alert_types, p.statuses, p.sev, p.score, p.flagged_at,
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
