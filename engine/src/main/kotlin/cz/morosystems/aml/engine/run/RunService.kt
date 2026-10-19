package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.EngineProperties
import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.rules.RuleRepository
import cz.morosystems.aml.engine.rules.RuleResolver
import cz.morosystems.aml.engine.sql.Period
import cz.morosystems.aml.engine.triage.TriageService
import java.sql.Timestamp
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper

/** Runs every active rule over a period: hits, grouped alerts and the alerts CSV, in one database transaction. */
@Service
class RunService(
    private val jdbc: JdbcClient,
    private val rules: RuleRepository,
    private val clients: ClientRepository,
    private val compiler: RuleCompiler,
    private val resolver: RuleResolver,
    private val evaluator: RuleEvaluator,
    private val picker: TransactionPicker,
    private val triage: TriageService,
    private val props: EngineProperties,
) {
    private val json = JsonMapper()

    @Transactional
    fun run(period: Period = Period.JULY_2026): RunReport {
        val active = rules.activeRules()
        val compiled = active.associateWith { rule -> compiler.compile(rule, rule.params.keys) }
        val clientRows = clients.findAll()
        val resolved = resolver.resolve(active, rules.segments(), clientRows)
        val clientsById = clientRows.associateBy { it["id"] as String }
        val lists = mapOf("high_risk" to clients.highRiskList())

        val runId = jdbc.sql(
            "insert into run (kind, period_from, period_to, rule_ids, started_at) values ('production', ?, ?, ?, now()) returning id",
        ).params(Timestamp.valueOf(period.from), Timestamp.valueOf(period.toExclusive), active.map { it.id }.toTypedArray())
            .query(Long::class.java).single()

        val hits = active.flatMap { rule ->
            val applicable = resolved.clientsByRule[rule].orEmpty()
            if (applicable.isEmpty()) emptyList() else evaluator.evaluate(rule, compiled.getValue(rule), period, applicable, clientsById, lists)
        }
        val withIds = assignIds(hits)
        insertHits(runId, withIds)

        val alerts = AlertGrouper.group(withIds, clients.alertUnits()).map { it.copy(transactionId = picker.pick(it)) }
        val stored = alerts.map { insertAlert(runId, it) to it }
        val decisions = triage.triageRun(runId).associateBy { it.alertId }
        val csv = props.outDir.resolve("alerts-$runId.csv")
        CsvExporter.write(csv, stored, decisions)

        val report = RunReport(
            runId = runId,
            hitsPerRule = withIds.groupingBy { it.ruleKey }.eachCount(),
            alertsPerType = alerts.groupingBy { it.alertType }.eachCount(),
            csv = csv,
        )
        jdbc.sql("update run set finished_at = now(), report = ?::jsonb where id = ?")
            .params(json.writeValueAsString(mapOf("hitsPerRule" to report.hitsPerRule, "alertsPerType" to report.alertsPerType)), runId)
            .update()
        return report
    }

    private fun assignIds(hits: List<Hit>): List<Hit> {
        if (hits.isEmpty()) return hits
        val ids = jdbc.sql("select nextval('rule_hit_id_seq') from generate_series(1, ?)").param(hits.size).query(Long::class.java).list().filterNotNull()
        return hits.zip(ids) { hit, id -> hit.copy(id = id) }
    }

    private fun insertHits(runId: Long, hits: List<Hit>) {
        hits.chunked(BATCH).forEach { chunk ->
            val values = chunk.joinToString(", ") { "(?, ?, ?, ?, ?, ?::jsonb)" }
            val params = chunk.flatMap { listOf(it.id, runId, it.ruleId, it.clientId, it.grainKey, json.writeValueAsString(it.evidence)) }
            jdbc.sql("insert into rule_hit (id, run_id, rule_id, client_id, grain_key, evidence) values $values").params(params).update()
        }
    }

    private fun insertAlert(runId: Long, alert: AlertDraft): Long {
        val id = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, ?, ?, ?) returning id")
            .params(listOf(runId, alert.alertType, alert.clientId, alert.transactionId))
            .query(Long::class.java).single()
        alert.hits.chunked(BATCH).forEach { chunk ->
            jdbc.sql("insert into alert_hit (alert_id, hit_id) values ${chunk.joinToString(", ") { "(?, ?)" }}")
                .params(chunk.flatMap { listOf(id, it.id) }).update()
        }
        return id
    }

    private companion object {
        const val BATCH = 2_000
    }
}
