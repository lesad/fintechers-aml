package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.summary.Sentence
import org.assertj.core.api.Assertions.assertThatCode
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
        assertThatCode { checkClaims(body(Sentence("CZK 110,000 came in.", listOf("rule:C1"))), known, input) }.doesNotThrowAnyException()
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
    fun checksNumbersInTextsThatCiteNothing() {
        assertThatThrownBy { checkClaims(body(Sentence("x", listOf("rule:C1")), "A payslip over CZK 120,000."), known, input) }
            .isInstanceOf(InvalidAiOutputException::class.java).hasMessageContaining("x[0].wouldConfirm").hasMessageContaining("120,000")
    }

    @Test
    fun refusesAValueOffItsList() {
        assertThatThrownBy { enumOf(mapOf("askWho" to "regulator"), "askWho", "questions[0]", setOf("client", "analyst")) }
            .hasMessageContaining("regulator")
    }
}
