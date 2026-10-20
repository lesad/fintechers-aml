package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.alert.AlertRepository
import cz.morosystems.aml.engine.rules.RuleRepository
import cz.morosystems.aml.engine.run.ClientRepository
import cz.morosystems.aml.engine.summary.AlertActivity
import cz.morosystems.aml.engine.summary.AlertNotFoundException
import cz.morosystems.aml.engine.summary.SummaryService
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper

@Repository
class SuggestionRepository(
    private val jdbc: JdbcClient,
    private val alerts: AlertRepository,
    private val activity: AlertActivity,
    private val rules: RuleRepository,
    private val clients: ClientRepository,
    private val summaries: SummaryService,
) {
    private val json = JsonMapper()

    fun context(alertId: Long, reason: String): SuggestionContext {
        val alert = alerts.find(alertId) ?: throw AlertNotFoundException(alertId)
        val hitKeys = hitKeys(alertId)
        return SuggestionContext(
            alert = alert,
            reason = reason,
            activity = activity.collect(alertId),
            hitKeys = hitKeys,
            rules = rules.activeRules(),
            segments = rules.segments(),
            clients = clients.findAll(),
            latest = (hitKeys + hitKeys.map { clientKey(it, alert.clientId) }).mapNotNull { key -> rules.latestOf(key)?.let { key to it } }.toMap(),
            values = rules.fieldValues(),
            triage = triage(alertId),
            summary = summaries.latestText(alertId),
            existingRules = rules.allVersions().filter { it.status != "retired" },
        )
    }

    private fun triage(alertId: Long): Map<String, Any?>? =
        jdbc.sql("select disposition, score, reasons::text from alert_triage where alert_id = ?").param(alertId).query { rs, _ ->
            mapOf("disposition" to rs.getString(1), "score" to rs.getInt(2), "reasons" to json.readValue(rs.getString(3), List::class.java))
        }.optional().orElse(null)

    private fun hitKeys(alertId: Long): Set<String> =
        jdbc.sql(
            """
            select distinct r.key
            from alert_hit ah join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
            where ah.alert_id = ?
            """.trimIndent(),
        ).param(alertId).query(String::class.java).set().filterNotNull().toSet()
}
