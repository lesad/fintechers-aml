package cz.morosystems.aml.engine.triage

import java.sql.Date
import java.sql.Timestamp
import java.time.LocalDate
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper

/** One alert of a run as triage reads it: the alert row plus every rule hit grouped under it. */
data class TriageAlert(
    val id: Long,
    val alertType: String,
    val clientId: String,
    val transactionId: String?,
    val hits: List<TriagedHit>,
)

/** Everything triage reads from and writes to the database. No scoring happens here. */
@Repository
class TriageRepository(private val jdbc: JdbcClient) {
    private val json = JsonMapper()

    /**
     * The client facts triage scores, by client id.
     *
     * @remarks `contract_date` is deliberately outside the rule vocabulary — rules never see it — so this query
     * names its columns itself rather than borrowing `Vocabulary.client`.
     */
    fun clientFacts(): Map<String, ClientFacts> =
        jdbc.sql(
            """
            select id, risk, pep, country, channel, contract_date,
                   expected_monthly_volume, q2_volume, q2_tx_count, q2_days
            from client
            """,
        )
            .query { rs, _ ->
                ClientFacts(
                    id = rs.getString("id"),
                    risk = rs.getString("risk"),
                    pep = rs.getObject("pep") as Boolean?,
                    country = rs.getString("country"),
                    channel = rs.getString("channel"),
                    contractDate = (rs.getObject("contract_date") as Date?)?.toLocalDate(),
                    expectedMonthlyVolume = rs.getObject("expected_monthly_volume") as Double?,
                    q2Volume = rs.getObject("q2_volume") as Double?,
                    q2TxCount = rs.getObject("q2_tx_count") as Int?,
                    q2Days = rs.getObject("q2_days") as Int?,
                )
            }.list().associateBy { it.id }

    /** The live high-risk list. `reference_list` is the single source; the shipped config ships an empty one. */
    fun highRiskCountries(): Set<String> =
        jdbc.sql("select code from reference_list where list = 'high_risk'")
            .query(String::class.java).list().filterNotNull().map { it.uppercase() }.toSet()

    /** The name of each alert type, by code, as the reason lines spell it out. A code with no name is left out. */
    fun alertTypeNames(): Map<String, String> =
        jdbc.sql("select code, name from alert_type where name is not null and name <> code")
            .query { rs, _ -> rs.getString("code") to rs.getString("name") }
            .list().toMap()

    /**
     * The name of each rule, by key, as the reason lines spell it out. The latest version of a key wins — the same
     * `distinct on` the review queue uses — and a key whose latest version carries no name is left out.
     */
    fun ruleNames(): Map<String, String> =
        jdbc.sql("select key, name from (select distinct on (key) key, name from rule order by key, version desc) latest where name is not null")
            .query { rs, _ -> rs.getString("key") to rs.getString("name") }
            .list().toMap()

    /** The run's period end, exclusive. */
    fun periodTo(runId: Long): LocalDate? =
        jdbc.sql("select period_to from run where id = ?").param(runId)
            .query(Timestamp::class.java).optional().orElse(null)?.toLocalDateTime()?.toLocalDate()

    fun latestRunId(): Long? = jdbc.sql("select max(id) from run").query(Long::class.java).optional().orElse(null)

    /** Every alert of a run with its rule hits, in alert id order. */
    fun alertsOfRun(runId: Long): List<TriageAlert> {
        val rows = jdbc.sql(
            """
            select a.id as alert_id, a.alert_type, a.client_id, a.transaction_id,
                   r.key as rule_key, r.version as rule_version, h.grain_key, h.evidence::text as evidence
            from alert a
            left join alert_hit ah on ah.alert_id = a.id
            left join rule_hit h on h.id = ah.hit_id
            left join rule r on r.id = h.rule_id
            where a.run_id = ?
            order by a.id
            """,
        ).param(runId).query { rs, _ ->
            val ruleKey = rs.getString("rule_key")
            Triple(
                rs.getLong("alert_id"),
                listOf(rs.getString("alert_type"), rs.getString("client_id"), rs.getString("transaction_id")),
                ruleKey?.let { TriagedHit(it, rs.getInt("rule_version"), rs.getString("grain_key") ?: "", evidence(rs.getString("evidence"))) },
            )
        }.list()

        return rows.groupBy { it.first }.map { (alertId, group) ->
            val head = group.first().second
            TriageAlert(
                id = alertId,
                alertType = head[0].orEmpty(),
                clientId = head[1].orEmpty(),
                transactionId = head[2],
                hits = group.mapNotNull { it.third },
            )
        }.sortedBy { it.id }
    }

    /**
     * The countries of every party an alert touches: the payer and payee of each transaction-grain hit, plus of the
     * alert's own transaction. A non-transaction grain key simply matches no transaction.
     */
    fun counterpartyCountries(runId: Long): Map<Long, Set<String>> =
        jdbc.sql(
            """
            select alert_id, country from (
                select ah.alert_id, t.payer_country as country
                from alert a join alert_hit ah on ah.alert_id = a.id
                join rule_hit h on h.id = ah.hit_id
                join transaction t on t.id = h.grain_key
                where a.run_id = ?
                union
                select ah.alert_id, t.payee_country
                from alert a join alert_hit ah on ah.alert_id = a.id
                join rule_hit h on h.id = ah.hit_id
                join transaction t on t.id = h.grain_key
                where a.run_id = ?
                union
                select a.id, t.payer_country from alert a join transaction t on t.id = a.transaction_id where a.run_id = ?
                union
                select a.id, t.payee_country from alert a join transaction t on t.id = a.transaction_id where a.run_id = ?
            ) parties
            where country is not null
            """,
        ).params(runId, runId, runId, runId)
            .query { rs, _ -> rs.getLong(1) to rs.getString(2).uppercase() }
            .list()
            .groupBy({ it.first }, { it.second })
            .mapValues { it.value.toSet() }

    /** Upserts the decisions so a re-triage of the same run replaces its earlier verdict instead of failing. */
    fun save(decisions: List<TriageDecision>) {
        decisions.chunked(BATCH).forEach { chunk ->
            val values = chunk.joinToString(", ") { "(?, ?, ?, ?::jsonb, ?, ?)" }
            val params = chunk.flatMap {
                listOf(
                    it.alertId,
                    it.disposition.name,
                    it.score,
                    json.writeValueAsString(it.reasons.map { reason -> mapOf("code" to reason.code, "description" to reason.description, "points" to reason.points) }),
                    it.configVersion,
                    it.inputHash,
                )
            }
            jdbc.sql(
                """
                insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash) values $values
                on conflict (alert_id) do update set
                    disposition = excluded.disposition,
                    score = excluded.score,
                    reasons = excluded.reasons,
                    config_version = excluded.config_version,
                    input_hash = excluded.input_hash,
                    decided_at = now()
                """,
            ).params(params).update()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun evidence(raw: String?): Map<String, Any?> =
        // The column is `jsonb` of a flat object written by the run; Jackson hands back a LinkedHashMap of it.
        if (raw.isNullOrBlank()) emptyMap() else json.readValue(raw, Map::class.java) as Map<String, Any?>

    private companion object {
        const val BATCH = 2_000
    }
}
