package cz.morosystems.aml.engine.rules

import java.time.Duration
import org.springframework.jdbc.core.simple.JdbcClient

/** Back to the seeded rules: drops every draft and clears explanations, since all Postgres tests share one database. */
fun JdbcClient.resetRules() {
    sql("delete from rule_variable where rule_id in (select id from rule where status = 'draft')").update()
    sql("delete from rule_param where rule_id in (select id from rule where status = 'draft')").update()
    sql("delete from rule where status = 'draft'").update()
    sql("update rule set explanation = null, explanation_model = null, explanation_prompt_hash = null").update()
}

fun newB2(pepMin: Long = 5_000_000, key: String = "B2") = NewRule(
    key = key,
    alertType = "B",
    layer = Layer.COMPANY,
    scopeSegmentId = null,
    scopeClientId = null,
    grain = Grain.TRANSACTION,
    anchor = null,
    condition = """client.pep && tx.amount > p.pep_min && tx.direction in ["out", "unknown"]""",
    replacesKey = null,
    variables = emptyList(),
    params = mapOf("pep_min" to Param(pepMin, ParamUnit.AMOUNT)),
    author = "J. Novák",
)

fun newC1(key: String = "C9") = NewRule(
    key = key,
    alertType = "C",
    layer = Layer.COMPANY,
    scopeSegmentId = null,
    scopeClientId = null,
    grain = Grain.CLIENT_ANCHOR,
    anchor = """tx.direction == "in"""",
    condition = "inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow",
    replacesKey = null,
    variables = listOf(
        VariableDefinition(1, "inflow", Agg.SUM, "amount", """tx.direction == "in"""", Window.Relative(Duration.ofHours(-24), Duration.ZERO)),
        VariableDefinition(2, "payers", Agg.SET, "payer_account", """tx.direction == "in"""", Window.Relative(Duration.ofHours(-24), Duration.ZERO)),
        VariableDefinition(3, "outflow", Agg.SUM, "amount", """tx.direction in ["out", "unknown"] && !(tx.payee_account in payers)""", Window.Relative(Duration.ZERO, Duration.ofHours(6))),
    ),
    params = mapOf("min_inflow" to Param(10_000_000, ParamUnit.AMOUNT), "forward_pct" to Param(80, ParamUnit.PERCENT)),
    author = "J. Novák",
)
