package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.rules.Layer
import cz.morosystems.aml.engine.run.ClientRepository
import cz.morosystems.aml.engine.run.RuleEvaluator
import cz.morosystems.aml.engine.sql.Period
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * [minHits]: how many hits a change must stop, this alert's included, to be worth suggesting. Alerts of a per-client
 * type hold all of the client's hits in the run, so "other alerts" alone would rule out every client change.
 */
@ConfigurationProperties("suggestion")
data class SuggestionProperties(val minHits: Int = 2)

/**
 * Measures a drafted rule against the alert's run: it evaluates the new rule over the period and compares its hits with
 * the hits of the rule it replaces or retires. An alert closes only when every one of its hits stops.
 */
@Component
class SuggestionImpact(
    private val jdbc: JdbcClient,
    private val evaluator: RuleEvaluator,
    private val compiler: RuleCompiler,
    private val clients: ClientRepository,
    private val properties: SuggestionProperties,
) {
    @Transactional(readOnly = true)
    fun measure(draft: Draft, context: SuggestionContext): Impact {
        val alert = context.alert
        val rule = draft.definition
        val program = compiler.compile(rule, rule.params.keys)
        val clientsById = context.clients.associateBy { it["id"] as String }
        val lists = mapOf("high_risk" to clients.highRiskList())
        val after = evaluator.evaluate(rule, program, period(alert.runId), draft.clients, clientsById, lists).map { it.clientId to it.grainKey }.toSet()

        val ruleIds = setOfNotNull(draft.base.id, draft.retires?.id)
        val before = jdbc.sql("select id, client_id, grain_key from rule_hit where run_id = ? and rule_id = any(?) and client_id = any(?)")
            .params(alert.runId, ruleIds.toTypedArray(), draft.clients.toTypedArray())
            .query { rs, _ -> HitRow(rs.getLong(1), rs.getString(2), rs.getString(3)) }.list()
        val stopped = before.filter { (it.clientId to it.grainKey) !in after }.map { it.id }.toSet()
        val added = after - before.map { it.clientId to it.grainKey }.toSet()

        val alerts = alertsWith(stopped)
        val closed = alerts.filter { a -> a.hits.all { it in stopped } }
        val own = thisAlertHits(alert.id)
        fun counts(inScope: (String) -> Boolean) = ImpactCounts(
            hitsStopped = before.count { it.id in stopped && inScope(it.clientId) },
            hitsAdded = added.count { inScope(it.first) },
            alertsClosed = closed.count { it.id != alert.id && inScope(it.clientId) },
            closedByDisposition = closed.filter { it.id != alert.id && inScope(it.clientId) }
                .groupingBy { it.disposition ?: "UNTRIAGED" }.eachCount(),
        )
        return Impact(
            stopsThisAlert = own.any { it in stopped },
            closesThisAlert = closed.any { it.id == alert.id },
            client = counts { it == alert.clientId },
            company = if (rule.layer == Layer.COMPANY) counts { true } else null,
        )
    }

    /** Why the change is not worth suggesting, or null when it is. */
    fun declineReason(impact: Impact): String? {
        val scope = impact.company ?: impact.client
        val risky = scope.closedByDisposition.filterKeys { it in RISKY }.values.sum()
        return when {
            !impact.stopsThisAlert -> "The change would not stop this alert."
            risky > 0 -> "The change would also close $risky other alerts that triage rated high or escalated."
            scope.hitsAdded > 0 -> "The change would raise ${scope.hitsAdded} new hits."
            scope.hitsStopped < properties.minHits -> "The change would stop only ${scope.hitsStopped} hit in this run, too few to be worth a rule."
            else -> null
        }
    }

    private fun period(runId: Long): Period =
        jdbc.sql("select period_from, period_to from run where id = ?").param(runId)
            .query { rs, _ -> rs.getTimestamp(1)?.let { from -> rs.getTimestamp(2)?.let { to -> Period(from.toLocalDateTime(), to.toLocalDateTime()) } } }
            .list().filterNotNull().firstOrNull() ?: Period.JULY_2026

    private fun thisAlertHits(alertId: Long): Set<Long> =
        jdbc.sql("select hit_id from alert_hit where alert_id = ?").param(alertId).query(Long::class.java).set().filterNotNull().toSet()

    private fun alertsWith(hitIds: Set<Long>): List<AlertRow> {
        if (hitIds.isEmpty()) return emptyList()
        return jdbc.sql(
            """
            select a.id, a.client_id, t.disposition, array_agg(ah.hit_id) as hits
            from alert a join alert_hit ah on ah.alert_id = a.id left join alert_triage t on t.alert_id = a.id
            where a.id in (select alert_id from alert_hit where hit_id = any(?))
            group by a.id, a.client_id, t.disposition
            """.trimIndent(),
        ).param(hitIds.toTypedArray()).query { rs, _ ->
            AlertRow(rs.getLong(1), rs.getString(2), rs.getString(3), (rs.getArray(4).array as Array<*>).map { (it as Number).toLong() })
        }.list()
    }

    private data class HitRow(val id: Long, val clientId: String, val grainKey: String)

    private data class AlertRow(val id: Long, val clientId: String, val disposition: String?, val hits: List<Long>)

    private companion object {
        val RISKY = setOf("REVIEW_HIGH", "ESCALATE")
    }
}
