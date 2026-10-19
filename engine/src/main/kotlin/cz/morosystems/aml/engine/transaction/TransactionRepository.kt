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

    /** Flagged transactions of the latest finished run: highest rating first, then oldest flag first. */
    fun flagged(query: String?, rating: String?, page: Int, size: Int): TransactionPage {
        val filter = """
            where (:q = '' or f.id ilike :like or t.client_id ilike :like)
              and (:rating = '' or $RATING = :rating)
        """
        val q = query?.trim().orEmpty()
        val params = mapOf("q" to q, "like" to "%$q%", "rating" to rating.orEmpty())

        val items = jdbc.sql(
            """
            $FLAGGED
            select f.id, t.client_id, t.ts, t.amount, t.volume, t.currency, t.direction,
                   f.alert_types, f.rules, f.flagged_at, $RATING as rating
            from flagged f join transaction t on t.id = f.id join client c on c.id = t.client_id
            $filter
            order by $RATING_RANK, f.flagged_at, f.id
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
                rules = rs.strings("rules"),
                rating = rs.getString("rating"),
                flaggedAt = rs.getObject("flagged_at", OffsetDateTime::class.java),
            )
        }.list()

        val total = jdbc.sql(
            "$FLAGGED select count(*) from flagged f join transaction t on t.id = f.id join client c on c.id = t.client_id $filter",
        ).params(params).query(Long::class.java).single()

        val counts = jdbc.sql(
            "$FLAGGED select $RATING as rating, count(*) as n from flagged f join transaction t on t.id = f.id " +
                "join client c on c.id = t.client_id group by 1",
        ).query { rs, _ -> rs.getString("rating") to rs.getLong("n") }.list().toMap()

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

        val rating = jdbc.sql(
            "$FLAGGED select $RATING from flagged f join client c on c.id = ? where f.id = ?",
        ).params(client.id, id).query(String::class.java).optional().orElse(null)

        return TransactionDetail(tx, client, rating, alerts(id), history(client.id))
    }

    private fun alerts(transactionId: String): List<TransactionAlert> {
        val alerts = jdbc.sql(
            "select a.id, a.alert_type, a.created_at from alert a where a.run_id = ($LATEST_RUN) and a.transaction_id = ? order by a.id",
        ).param(transactionId).query { rs, _ ->
            Triple(rs.getLong("id"), rs.getString("alert_type"), rs.getObject("created_at", OffsetDateTime::class.java))
        }.list()
        return alerts.map { (alertId, type, createdAt) ->
            val hits = jdbc.sql(
                """
                select r.key, r.version, h.grain_key, h.evidence::text as evidence
                from alert_hit ah join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
                where ah.alert_id = ? order by r.key, h.grain_key
                """,
            ).param(alertId).query { rs, _ ->
                @Suppress("UNCHECKED_CAST") // evidence is a JSON object written by RunService
                val evidence = rs.getString("evidence")?.let { json.readValue(it, Map::class.java) as Map<String, Any?> } ?: emptyMap()
                Hit(rs.getString("key"), rs.getInt("version"), rs.getString("grain_key"), evidence)
            }.list()
            TransactionAlert(alertId, type, createdAt, hits)
        }
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

    private companion object {
        val RATINGS = listOf("High", "Medium", "Low")

        const val LATEST_RUN = "select max(id) from run where finished_at is not null"

        /** One row per transaction the latest run alerted on, with its alert types and the rules that fired. */
        const val FLAGGED = """
            with flagged as (
                select a.transaction_id as id,
                       array_agg(distinct a.alert_type order by a.alert_type) as alert_types,
                       array_remove(array_agg(distinct r.key order by r.key), null) as rules,
                       min(a.created_at) as flagged_at
                from alert a
                left join alert_hit ah on ah.alert_id = a.id
                left join rule_hit h on h.id = ah.hit_id
                left join rule r on r.id = h.rule_id
                where a.run_id = ($LATEST_RUN) and a.transaction_id is not null
                group by a.transaction_id
            )
        """

        // shortcut: rating from the alert type and the client's AML risk score, until the priority
        // scorecard (docs/rules/priority.md) is computed by the engine; then rate by its band.
        const val RATING = """
            (case when 'B' = any(f.alert_types) or 'C' = any(f.alert_types) then 'High'
                  when c.risk = 'low' then 'Low' else 'Medium' end)
        """
        const val RATING_RANK = "(case $RATING when 'High' then 0 when 'Medium' then 1 else 2 end)"
    }
}
