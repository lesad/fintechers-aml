package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.summary.Sentence
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class ClaimWalkerTest {
    private val known = setOf("rule:C1", "triage:decision")
    private val input = mapOf("activity" to listOf(mapOf("ref" to "rule:C1", "data" to mapOf("inflow" to 110000))))

    private fun body(claim: Sentence, text: String = "") = object : AiBody {
        override fun claims() = mapOf("x[0]" to claim)
        override fun texts() = mapOf("x[0].wouldConfirm" to text)
    }

    @Test
    fun acceptsKnownRefsAndInputNumbers() {
        assertThat(checkClaims(body(Sentence("CZK 110,000 came in.", listOf("rule:C1"))), known, input)).isEmpty()
    }

    @Test
    fun refusesAClaimWithoutRefs() {
        assertThatThrownBy { checkClaims(body(Sentence("x", emptyList())), known, input) }.hasMessage("x[0] cites nothing")
    }

    @Test
    fun refusesAnUnknownRef() {
        assertThatThrownBy { checkClaims(body(Sentence("x", listOf("rule:A1"))), known, input) }.hasMessageContaining("rule:A1")
    }

    @Test
    fun acceptsAnInputNumberRoundedToAWholeNumber() {
        val input = mapOf("activity" to listOf(mapOf("ref" to "rule:C1", "data" to mapOf("amount" to 1032539.3, "max" to 39918.96))))
        assertThat(checkClaims(body(Sentence("CZK 1,032,539 is far above CZK 39,919.", listOf("rule:C1"))), known, input)).isEmpty()
    }

    @Test
    fun aRoundedDecimalIsStillAWarning() {
        val input = mapOf("activity" to listOf(mapOf("ref" to "rule:C1", "data" to mapOf("max" to 39918.96))))
        assertThat(checkClaims(body(Sentence("CZK 39,919.0 at most.", listOf("rule:C1"))), known, input)).hasSize(1)
    }

    @Test
    fun warnsOfANumberNotInTheInput() {
        assertThat(checkClaims(body(Sentence("CZK 99,000 came in.", listOf("rule:C1")), "A payslip over CZK 120,000."), known, input)).containsExactly(
            AiWarning("x[0]", "numbers not in the input: [99,000]", listOf("99,000")),
            AiWarning("x[0].wouldConfirm", "numbers not in the input: [120,000]", listOf("120,000")),
        )
    }

    @Test
    fun refusesAValueOffItsList() {
        assertThatThrownBy { enumOf(mapOf("askWho" to "regulator"), "askWho", "questions[0]", setOf("client", "analyst")) }
            .hasMessageContaining("regulator")
    }
}
