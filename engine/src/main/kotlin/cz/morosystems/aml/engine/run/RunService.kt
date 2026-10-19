package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.EngineProperties
import cz.morosystems.aml.engine.cel.Activations
import cz.morosystems.aml.engine.cel.CompiledRule
import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.cel.Vocabulary
import cz.morosystems.aml.engine.plainDecimal
import cz.morosystems.aml.engine.rules.Agg
import cz.morosystems.aml.engine.rules.Grain
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.rules.RuleRepository
import cz.morosystems.aml.engine.rules.RuleResolver
import cz.morosystems.aml.engine.sql.GrainQueryBuilder
import cz.morosystems.aml.engine.sql.Period
import cz.morosystems.aml.engine.triage.TriageService
import java.sql.ResultSet
import java.sql.Timestamp
import javax.sql.DataSource
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper

/** Runs every active rule over a period: hits, grouped alerts and the alerts CSV, in one database transaction. */
@Service
class RunService(
    dataSource: DataSource,
    private val jdbc: JdbcClient,
    private val rules: RuleRepository,
    private val clients: ClientRepository,
    private val compiler: RuleCompiler,
    private val resolver: RuleResolver,
    private val queries: GrainQueryBuilder,
    private val picker: TransactionPicker,
    private val triage: TriageService,
    private val props: EngineProperties,
) {
    // NOTE: Postgres only streams a result set with a fetch size inside a transaction, hence a dedicated template.
    private val streaming = JdbcClient.create(JdbcTemplate(dataSource).apply { fetchSize = 5_000 })
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
            if (applicable.isEmpty()) emptyList() else evaluate(rule, compiled.getValue(rule), period, applicable, clientsById, lists)
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

    private fun evaluate(
        rule: RuleDefinition,
        program: CompiledRule,
        period: Period,
        applicable: Set<String>,
        clientsById: Map<String, Map<String, Any?>>,
        lists: Map<String, List<String>>,
    ): List<Hit> {
        val query = queries.build(rule, period, applicable.takeIf { it.size < clientsById.size })
        val params = rule.params.mapValues { it.value.value }
        val hits = mutableListOf<Hit>()
        streaming.sql(query.sql).params(query.params).query { rs: ResultSet ->
            val clientId = rs.getString("client_id")
            if (clientId in applicable) {
                val tx = if (rule.grain == Grain.CLIENT_DAY) null else Vocabulary.tx.keys.associateWith { rs.getObject(it) }
                val day = if (rule.grain == Grain.CLIENT_DAY) mapOf("month" to rs.getInt("day_month")) else null
                val variables = rule.variables.associate { it.name to column(rs, it.name, it.agg) }
                val activation = Activations.of(tx, clientsById.getValue(clientId), params, lists, variables, day)
                val fired = try {
                    program.evaluate(activation)
                } catch (e: Exception) {
                    throw IllegalStateException("rule ${rule.key}, client $clientId, ${rule.grain.name.lowercase()} ${rs.getString("grain_key")}: ${e.message}", e)
                }
                if (fired) {
                    val evidence = (variables + params.mapKeys { "p.${it.key}" } + (tx?.let { mapOf("tx.amount" to it["amount"]) } ?: emptyMap()))
                        .mapValues { plainNumber(it.value) }
                    hits += Hit(0, rule.id, rule.key, rule.version, rule.alertType, clientId, rs.getString("grain_key"), rule.grain, evidence)
                }
            }
        }
        return hits
    }

    private fun column(rs: ResultSet, name: String, agg: Agg): Any? = when (agg) {
        Agg.SET -> (rs.getArray(name).array as Array<*>).map { it as String }
        Agg.COUNT -> rs.getLong(name)
        else -> rs.getDouble(name)
    }

    // A Double writes itself as 1.1E7 in JSON. Evidence is read by people and quoted by the summary model, so an
    // amount is stored as a plain decimal instead.
    private fun plainNumber(value: Any?): Any? = if (value is Double) plainDecimal(value) else value

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
