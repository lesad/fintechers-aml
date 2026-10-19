package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.bedrock.Bedrock
import cz.morosystems.aml.engine.bedrock.BedrockException
import cz.morosystems.aml.engine.bedrock.BedrockProperties
import java.time.Duration
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/** Stands in for Bedrock's plain-text call: returns [reply] (or throws [failure]) and remembers what it was asked. */
class FakeTextBedrock : Bedrock(BedrockProperties(modelId = "fake-model")) {
    var reply = ""
    var failure: Exception? = null
    var prompt = ""
    var askedModel = ""
    var calls = 0

    override fun ask(system: String, prompt: String, modelId: String): String {
        calls++
        this.prompt = prompt
        askedModel = modelId
        failure?.let { throw it }
        return reply
    }
}

class RuleExplainerTest {
    private val bedrock = FakeTextBedrock()
    private val explainer = RuleExplainer(bedrock, RulesProperties(explanationModelId = OPUS))

    private val b2 = RuleDefinition(
        1, "B2", 1, "B", Layer.COMPANY, null, null, Grain.TRANSACTION, null,
        """client.pep && tx.amount > p.pep_min && tx.direction in ["out", "unknown"]""", null, emptyList(),
        mapOf("pep_min" to 10_000_000L),
    )

    private val c1 = RuleDefinition(
        7, "C1", 2, "C", Layer.COMPANY, null, null, Grain.CLIENT_ANCHOR, """tx.direction == "in"""",
        "inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow", null,
        listOf(
            VariableDefinition(1, "inflow", Agg.SUM, "amount", """tx.direction == "in"""", Window.Relative(Duration.ofHours(-24), Duration.ZERO)),
            VariableDefinition(2, "payers", Agg.SET, "payer_account", """tx.direction == "in"""", Window.Relative(Duration.ofHours(-24), Duration.ZERO)),
            VariableDefinition(3, "outflow", Agg.SUM, "amount", """tx.direction in ["out", "unknown"] && !(tx.payee_account in payers)""", Window.Relative(Duration.ZERO, Duration.ofHours(6))),
        ),
        mapOf("min_inflow" to 10_000_000L, "forward_pct" to 80L),
    )

    @Test
    fun promptSpellsComparisonsAndBothParameterReadings() {
        val prompt = explanationPrompt(b2, null)
        assertThat(prompt).contains("tx.amount IS MORE THAN p.pep_min")
        assertThat(prompt).contains("Parameter p.pep_min = 10000000 (if this is an amount in haléře: 100,000 CZK)")
        assertThat(prompt).contains("Rule B2 v1, alert type B, company-wide.")
    }

    @Test
    fun promptDescribesVariablesAndWindows() {
        val prompt = explanationPrompt(c1, null)
        assertThat(prompt).contains("""Anchor transactions: tx.direction == "in"""")
        assertThat(prompt).contains("outflow * 100 IS AT LEAST p.forward_pct * inflow")
        assertThat(prompt).contains(
            """Variable inflow = sum of amount over transactions where tx.direction == "in", window: 24 hours before the anchor transaction, up to it""",
        )
        assertThat(prompt).contains("window: from the anchor transaction to 6 hours after it")
    }

    @Test
    fun promptNamesTheScopeOfANonCompanyRule() {
        assertThat(explanationPrompt(b2.copy(layer = Layer.SEGMENT, scopeSegmentId = 3), "big")).contains("Rule B2 v1, alert type B, segment big.")
        assertThat(explanationPrompt(b2.copy(layer = Layer.CLIENT, scopeClientId = "K1"), null)).contains("Rule B2 v1, alert type B, client K1.")
    }

    @Test
    fun storesAValidReplyWithModelAndHash() {
        bedrock.reply = "Flags outgoing or unknown-direction transactions of more than 100,000 CZK when the client is a politically exposed person."
        val explanation = explainer.explain(b2)
        assertThat(explanation?.text).isEqualTo(bedrock.reply)
        assertThat(explanation?.modelId).isEqualTo(OPUS)
        assertThat(explanation?.promptHash).matches("[0-9a-f]{64}")
        assertThat(bedrock.askedModel).isEqualTo(OPUS)
    }

    @Test
    fun acceptsTheTunedC1Explanation() {
        bedrock.reply = "Flags when a client receives more than 100,000 CZK in incoming payments within 24 hours, and within 6 hours " +
            "afterwards forwards at least 80% of that amount in outgoing payments or remittances to accounts other than those that paid them."
        assertThat(explainer.explain(c1)?.text).isEqualTo(bedrock.reply)
    }

    @Test
    fun rejectsANumberNotInTheInput() {
        bedrock.reply = "Flags outgoing or unknown-direction transactions of more than 250,000 CZK when the client is a politically exposed person."
        assertThat(explainer.explain(b2)).isNull()
    }

    @Test
    fun rejectsANumberOnlyTheSystemPromptHas() {
        val a3 = b2.copy(key = "A3", alertType = "A", condition = "client.q2_tx_count > 0 && tx.amount > p.max_multiple * client.q2_max_tx", params = mapOf("max_multiple" to 2L))
        bedrock.reply = "Flags a transaction whose amount is more than 3 times the client's largest single transaction in Q2."
        assertThat(explainer.explain(a3)).isNull()
    }

    @Test
    fun rejectsAReplyNotStartingWithFlags() {
        bedrock.reply = "This rule flags transactions of politically exposed persons."
        assertThat(explainer.explain(b2)).isNull()
    }

    @Test
    fun rejectsBlankOverlongOrFencedReplies() {
        for (reply in listOf("", "Flags " + "x".repeat(495), "Flags ```client.pep```")) {
            bedrock.reply = reply
            assertThat(explainer.explain(b2)).`as`(reply.take(20)).isNull()
        }
    }

    @Test
    fun aBedrockFailureIsNull() {
        bedrock.failure = BedrockException("The SSO session has expired")
        assertThat(explainer.explain(b2)).isNull()
    }

    private companion object {
        const val OPUS = "eu.anthropic.claude-opus-4-5-20251101-v1:0"
    }
}
