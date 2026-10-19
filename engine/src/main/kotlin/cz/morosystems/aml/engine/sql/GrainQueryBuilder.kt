package cz.morosystems.aml.engine.sql

import cz.morosystems.aml.engine.cel.Vocabulary
import cz.morosystems.aml.engine.rules.Agg
import cz.morosystems.aml.engine.rules.Grain
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.rules.VariableDefinition
import cz.morosystems.aml.engine.rules.Window
import java.sql.Timestamp
import java.time.LocalDateTime
import org.springframework.stereotype.Component

data class Period(val from: LocalDateTime, val toExclusive: LocalDateTime) {
    companion object {
        val JULY_2026 = Period(LocalDateTime.of(2026, 7, 1, 0, 0), LocalDateTime.of(2026, 8, 1, 0, 0))
    }
}

/**
 * Builds the SQL that returns one row per grain row of a rule, with every rule variable as a column named after it.
 *
 * @param clientIds `null` for every client
 * @remarks Rows carry `grain_key`; transaction and anchor grains also carry every `transaction` column,
 * client-day grains carry `client_id`, `day` and `day_month`.
 */
@Component
class GrainQueryBuilder(private val filters: FilterCompiler) {
    fun build(rule: RuleDefinition, period: Period, clientIds: Set<String>?): SqlFragment {
        val params = mutableListOf<Any?>(Timestamp.valueOf(period.from), Timestamp.valueOf(period.toExclusive))
        val clientFilter = clientIds?.let {
            params.add(it.toTypedArray())
            " and tx.client_id = any(?)"
        }.orEmpty()

        val base = when (rule.grain) {
            Grain.TRANSACTION ->
                "with g as (select * from $TX_SOURCE tx where tx.ts >= ? and tx.ts < ?$clientFilter) select g.*, g.id as grain_key"
            Grain.CLIENT_ANCHOR -> {
                val anchor = filters.compile(requireNotNull(rule.anchor) { "rule ${rule.key}: anchor grain needs an anchor" }, emptyMap())
                params.addAll(anchor.params)
                "with g as (select * from $TX_SOURCE tx where tx.ts >= ? and tx.ts < ?$clientFilter and (${anchor.sql})) select g.*, g.id as grain_key"
            }
            Grain.CLIENT_DAY ->
                "with g as (select tx.client_id, tx.ts::date as day from $TX_SOURCE tx where tx.ts >= ? and tx.ts < ?$clientFilter group by 1, 2) " +
                    "select g.client_id, g.day, extract(month from g.day)::int as day_month, to_char(g.day, 'YYYY-MM-DD') as grain_key"
        }

        val variables = rule.variables.sortedBy { it.position }
        val laterals = StringBuilder()
        val earlier = mutableMapOf<String, Agg>()
        variables.forEach { variable ->
            validate(rule, variable)
            val filter = filters.compile(variable.filter, earlier)
            val window = when (val w = variable.window) {
                Window.Day -> "tx.ts >= g.day and tx.ts < g.day + 1"
                is Window.Relative -> {
                    params.add(w.from.toSeconds().toDouble())
                    params.add(w.to.toSeconds().toDouble())
                    "tx.ts > g.ts + make_interval(secs => ?) and tx.ts <= g.ts + make_interval(secs => ?)"
                }
            }
            params.addAll(filter.params)
            laterals.append(
                " cross join lateral (select ${aggregate(variable)} as ${variable.name} from $TX_SOURCE tx " +
                    "where tx.client_id = g.client_id and $window and (${filter.sql})) v${variable.position}",
            )
            earlier[variable.name] = variable.agg
        }

        val columns = variables.joinToString("") { ", v${it.position}.${it.name}" }
        return SqlFragment("$base$columns from g$laterals", params)
    }

    private fun aggregate(variable: VariableDefinition): String {
        val field = "tx.${variable.field}"
        return when (variable.agg) {
            // Money is CZK as a double; an aggregate over it is one too, so CEL sees the same type the rule declares.
            Agg.SUM -> "coalesce(sum($field), 0)::double precision"
            Agg.MAX -> "coalesce(max($field), 0)::double precision"
            Agg.MIN -> "coalesce(min($field), 0)::double precision"
            Agg.COUNT -> "count(*)"
            Agg.SET -> "coalesce(array_agg(distinct $field) filter (where nullif($field::text, '') is not null), '{}')"
        }
    }

    private fun validate(rule: RuleDefinition, variable: VariableDefinition) {
        require(variable.field in Vocabulary.tx) { "rule ${rule.key}: unknown field '${variable.field}'" }
        require(IDENTIFIER.matches(variable.name)) { "rule ${rule.key}: invalid variable name '${variable.name}'" }
        require(variable.name !in TRANSACTION_COLUMNS) {
            "rule ${rule.key}: variable '${variable.name}' clashes with a transaction column"
        }
    }

    private companion object {
        // NOTE: CEL conditions see a missing account or country as "" (Activations); filters must see the same, not SQL NULL.
        const val TX_SOURCE = "(select id, client_id, ts, amount, volume, currency, fx_rate, type, direction, " +
            "coalesce(payer_country, '') as payer_country, coalesce(payee_country, '') as payee_country, " +
            "coalesce(payer_account, '') as payer_account, coalesce(payee_account, '') as payee_account, " +
            "extract(month from ts)::int as month from transaction)"
        val IDENTIFIER = Regex("[a-z_][a-z0-9_]*")
        val TRANSACTION_COLUMNS = Vocabulary.tx.keys + setOf("client_id", "ts", "volume", "fx_rate", "grain_key", "day", "day_month")
    }
}
