package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.cel.Activations
import cz.morosystems.aml.engine.cel.CompiledRule
import cz.morosystems.aml.engine.cel.Vocabulary
import cz.morosystems.aml.engine.plainDecimal
import cz.morosystems.aml.engine.rules.Agg
import cz.morosystems.aml.engine.rules.Grain
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.sql.GrainQueryBuilder
import cz.morosystems.aml.engine.sql.Period
import java.sql.ResultSet
import javax.sql.DataSource
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component

/** Evaluates one compiled rule over a period for the clients it applies to; the caller must hold a transaction. */
@Component
class RuleEvaluator(dataSource: DataSource, private val queries: GrainQueryBuilder) {
    // NOTE: Postgres only streams a result set with a fetch size inside a transaction, hence a dedicated template.
    private val streaming = JdbcClient.create(JdbcTemplate(dataSource).apply { fetchSize = 5_000 })

    fun evaluate(
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
}
