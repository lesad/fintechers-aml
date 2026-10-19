package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.plainDecimal
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper

/** One thing that happened on an alert. `ref` is unique across sources, and is what a summary sentence cites. */
data class Activity(val ref: String, val kind: String, val data: Map<String, Any?>)

/** Collects what each step stored about an alert. A new step (triage, the analyst's decision) adds its query here. */
@Repository
class AlertActivity(private val jdbc: JdbcClient) {
    private val json = JsonMapper()

    fun collect(alertId: Long): List<Activity> = ruleHits(alertId) + triage(alertId)

    private fun ruleHits(alertId: Long): List<Activity> =
        jdbc.sql(
            """
            select r.key, r.condition, h.grain_key, h.evidence::text,
                   (select coalesce(jsonb_object_agg('p.' || p.name, p.unit), '{}') from rule_param p where p.rule_id = r.id)::text
            from alert_hit ah join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
            where ah.alert_id = ? order by r.key, h.id
            """.trimIndent(),
        ).param(alertId).query { rs, _ ->
            RuleHitRow(
                rs.getString(1), rs.getString(2), rs.getString(3),
                json.readValue(rs.getString(4), Map::class.java), json.readValue(rs.getString(5), Map::class.java),
            )
        }.list().groupBy { it.rule }.map { (rule, hits) -> ruleActivity(rule, hits) }

    /** The triage decision as `triage:decision`, then each scoring reason as `triage:<code>`; the reasons' points sum to the score. */
    private fun triage(alertId: Long): List<Activity> {
        val row = jdbc.sql("select disposition, score, config_version, reasons::text from alert_triage where alert_id = ?")
            .param(alertId)
            .query { rs, _ -> listOf(rs.getString(1), rs.getInt(2), rs.getString(3), rs.getString(4)) }
            .optional().orElse(null) ?: return emptyList()
        val decision = Activity(
            ref = "triage:decision",
            kind = "triage_decision",
            data = mapOf("disposition" to row[0], "score" to row[1], "configVersion" to row[2]),
        )
        val seen = mutableMapOf<String, Int>()
        val reasons = json.readValue(row[3] as String, List::class.java).map { reason ->
            val data = (reason as Map<*, *>).entries.associate { (k, v) -> k.toString() to v }
            val code = data["code"].toString()
            val n = seen.merge(code, 1, Int::plus)!!
            Activity(ref = if (n == 1) "triage:$code" else "triage:$code:$n", kind = "triage_reason", data = data)
        }
        return listOf(decision) + reasons
    }
}

internal data class RuleHitRow(val rule: String, val condition: String, val grainKey: String, val evidence: Map<*, *>, val units: Map<*, *>)

/**
 * All hits of one rule as `rule:<key>`, aggregated in code so the model never counts or compares:
 * the hit count, the grain keys, per evidence field its one value, or min and max when it varies, and the unit of each `p.` parameter.
 */
internal fun ruleActivity(rule: String, hits: List<RuleHitRow>): Activity {
    val fields = hits.flatMap { it.evidence.keys }.map { it.toString() }.distinct().sorted()
    val evidence = fields.associateWith { field ->
        val values = hits.map { it.evidence[field] }.distinct()
        // Amounts are CZK doubles; min and max go through BigDecimal so the aggregate keeps the stored digits.
        val numbers = values.filterIsInstance<Number>().map { plainDecimal(it) }
        when {
            values.size == 1 -> values.single()
            numbers.size == values.size -> mapOf("min" to numbers.min(), "max" to numbers.max())
            else -> values
        }
    }
    return Activity(
        ref = "rule:$rule",
        kind = "rule_hits",
        data = mapOf(
            "rule" to rule,
            "condition" to hits.first().condition,
            "hits" to hits.size,
            "grainKeys" to hits.map { it.grainKey },
            "evidence" to evidence,
            "units" to hits.fold(emptyMap<Any?, Any?>()) { units, hit -> units + hit.units },
        ),
    )
}
