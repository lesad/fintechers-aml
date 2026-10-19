package cz.morosystems.aml.engine.cel

import cz.morosystems.aml.engine.rules.Agg
import cz.morosystems.aml.engine.rules.Grain
import cz.morosystems.aml.engine.rules.Layer
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.rules.VariableDefinition
import cz.morosystems.aml.engine.rules.Window
import java.time.Duration
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class RuleCompilerTest {
    private val compiler = RuleCompiler()

    private val dayVolume = VariableDefinition(1, "day_volume", Agg.SUM, "amount", "true", Window.Day)
    private val c1Variables = listOf(
        VariableDefinition(1, "inflow", Agg.SUM, "amount", """tx.direction == "in"""", Window.Relative(Duration.ofHours(-24), Duration.ZERO)),
        VariableDefinition(2, "payers", Agg.SET, "payer_account", """tx.direction == "in"""", Window.Relative(Duration.ofHours(-24), Duration.ZERO)),
        VariableDefinition(3, "outflow", Agg.SUM, "amount", """tx.direction == "out" && !(tx.payee_account in payers)""", Window.Relative(Duration.ZERO, Duration.ofHours(6))),
    )

    private val a1 = rule("A1", Grain.CLIENT_DAY, "day_volume * 100 > p.projected_pct * client.expected_monthly_volume", variables = listOf(dayVolume))
    private val a2 = rule("A2", Grain.CLIENT_DAY, "client.q2_tx_count > 0 && day_volume * client.q2_days > p.avg_multiple * client.q2_volume", variables = listOf(dayVolume))
    private val a3 = rule("A3", Grain.TRANSACTION, "client.q2_tx_count > 0 && tx.amount > p.max_multiple * client.q2_max_tx")
    private val b1 = rule("B1", Grain.TRANSACTION, "tx.amount > p.country_min && (tx.payer_country in lists.high_risk || tx.payee_country in lists.high_risk || client.country in lists.high_risk)")
    private val b2 = rule("B2", Grain.TRANSACTION, """client.pep && tx.amount > p.pep_min && tx.direction in ["out", "unknown"]""")
    private val c1 = rule("C1", Grain.CLIENT_ANCHOR, "inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow", anchor = """tx.direction == "in"""", variables = c1Variables)

    private val seedParams = mapOf(
        "A1" to setOf("projected_pct"),
        "A2" to setOf("avg_multiple"),
        "A3" to setOf("max_multiple"),
        "B1" to setOf("country_min"),
        "B2" to setOf("pep_min"),
        "C1" to setOf("min_inflow", "forward_pct"),
    )

    @Test
    fun compilesAllSeedRules() {
        listOf(a1, a2, a3, b1, b2, c1).forEach { compiler.compile(it, seedParams.getValue(it.key)) }
    }

    @Test
    fun a1FiresAboveQuarterOfExpectedMonthly() {
        val compiled = compiler.compile(a1, seedParams.getValue("A1"))
        val client = mapOf<String, Any?>("expected_monthly_volume" to czk(100_000))
        assertThat(compiled.evaluate(activation(client = client, params = mapOf("projected_pct" to 25L), variables = mapOf("day_volume" to czk(30_000))))).isTrue()
        assertThat(compiled.evaluate(activation(client = client, params = mapOf("projected_pct" to 25L), variables = mapOf("day_volume" to czk(25_000))))).isFalse()
    }

    @Test
    fun a2UsesProratedQ2Baseline() {
        val compiled = compiler.compile(a2, seedParams.getValue("A2"))
        val client = mapOf<String, Any?>("q2_tx_count" to 40L, "q2_days" to 30L, "q2_volume" to czk(300_000))
        assertThat(compiled.evaluate(activation(client = client, params = mapOf("avg_multiple" to 3L), variables = mapOf("day_volume" to czk(31_000))))).isTrue()
    }

    @Test
    fun b2FiresOnPepOutgoingOrUnclearAboveThreshold() {
        val compiled = compiler.compile(b2, seedParams.getValue("B2"))
        val pep = mapOf<String, Any?>("pep" to true)
        val params = mapOf("pep_min" to czk(100_000))
        fun fires(direction: String, amountCzk: Long) =
            compiled.evaluate(activation(tx = mapOf("direction" to direction, "amount" to czk(amountCzk)), client = pep, params = params))
        assertThat(fires("unknown", 150_000)).isTrue()
        assertThat(fires("in", 500_000)).isFalse()
        assertThat(fires("out", 100_000)).isFalse()
    }

    @Test
    fun b1MatchesHighRiskPayeeWithMissingPayerAccount() {
        val compiled = compiler.compile(b1, seedParams.getValue("B1"))
        val tx = mapOf<String, Any?>("amount" to czk(10_001), "payer_country" to "CZ", "payee_country" to "IR", "payer_account" to null)
        val result = compiled.evaluate(activation(tx = tx, client = mapOf("country" to "CZ"), params = mapOf("country_min" to czk(10_000)), lists = mapOf("high_risk" to listOf("IR"))))
        assertThat(result).isTrue()
    }

    @Test
    fun c1FiresAtEightyPercentForwarded() {
        val compiled = compiler.compile(c1, seedParams.getValue("C1"))
        val params = mapOf("min_inflow" to czk(100_000), "forward_pct" to 80L)
        fun fires(inflow: Long, outflow: Long) =
            compiled.evaluate(activation(params = params, variables = mapOf("inflow" to czk(inflow), "outflow" to czk(outflow), "payers" to listOf("ACZ1"))))
        assertThat(fires(110_000, 90_000)).isTrue()
        assertThat(fires(110_000, 85_000)).isFalse()
    }

    @Test
    fun rejectsTypeErrorNamingRuleAndPart() {
        assertThatThrownBy { compiler.compile(rule("BAD", Grain.TRANSACTION, """tx.amount > "x""""), emptySet()) }
            .isInstanceOfSatisfying(RuleCompileException::class.java) {
                assertThat(it.ruleKey).isEqualTo("BAD")
                assertThat(it.part).isEqualTo("condition")
            }
    }

    @Test
    fun rejectsFilterReferencingLaterVariable() {
        val variables = listOf(
            VariableDefinition(1, "outflow", Agg.SUM, "amount", "!(tx.payee_account in payers)", Window.Day),
            VariableDefinition(2, "payers", Agg.SET, "payer_account", "true", Window.Day),
        )
        assertThatThrownBy { compiler.compile(rule("ORDER", Grain.CLIENT_DAY, "outflow > 0", variables = variables), emptySet()) }
            .isInstanceOfSatisfying(RuleCompileException::class.java) { assertThat(it.part).isEqualTo("filter:outflow") }
    }

    @Test
    fun compilesSegmentPredicateOverClient() {
        val predicate = compiler.compileClientPredicate("client.q2_volume > 100")
        assertThat(predicate.evaluate(Activations.of(null, mapOf("q2_volume" to 101L), emptyMap(), emptyMap(), emptyMap()))).isTrue()
    }

    private fun czk(amount: Long) = amount * 100

    private fun activation(
        tx: Map<String, Any?>? = null,
        client: Map<String, Any?> = emptyMap(),
        params: Map<String, Long> = emptyMap(),
        lists: Map<String, List<String>> = emptyMap(),
        variables: Map<String, Any?> = emptyMap(),
    ) = Activations.of(tx, client, params, lists, variables)

    private fun rule(
        key: String,
        grain: Grain,
        condition: String,
        anchor: String? = null,
        variables: List<VariableDefinition> = emptyList(),
    ) = RuleDefinition(0, key, 1, key.take(1), Layer.COMPANY, null, null, grain, anchor, condition, null, variables)
}
