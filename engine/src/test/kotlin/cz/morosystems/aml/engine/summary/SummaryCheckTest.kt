package cz.morosystems.aml.engine.summary

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class SummaryCheckTest {
    private val known = setOf("hit:1", "hit:2")

    @Test
    fun acceptsSentencesThatCiteKnownRefs() {
        val sentences = sentencesOf(listOf(mapOf("text" to " Rule C1 fired. ", "refs" to listOf("hit:1", "hit:2"))))
        assertThat(checkSummary(sentences, known)).containsExactly(Sentence("Rule C1 fired.", listOf("hit:1", "hit:2")))
    }

    @Test
    fun rejectsAnUnknownRef() {
        assertThatThrownBy { checkSummary(listOf(Sentence("x", listOf("hit:1", "hit:9"))), known) }
            .isInstanceOf(InvalidSummaryException::class.java).hasMessageContaining("hit:9")
    }

    @Test
    fun rejectsASentenceWithoutRefs() {
        assertThatThrownBy { checkSummary(listOf(Sentence("x", emptyList())), known) }.hasMessageContaining("cites nothing")
    }

    @Test
    fun rejectsNoneOrTooManySentences() {
        assertThatThrownBy { checkSummary(emptyList(), known) }.isInstanceOf(InvalidSummaryException::class.java)
        assertThatThrownBy { checkSummary(List(4) { Sentence("x", listOf("hit:1")) }, known) }.hasMessageContaining("at most 3")
    }

    @Test
    fun rejectsAnotherShape() {
        assertThatThrownBy { sentencesOf("text") }.isInstanceOf(InvalidSummaryException::class.java)
        assertThatThrownBy { sentencesOf(listOf(mapOf("text" to "x"))) }.hasMessageContaining("no refs")
        assertThatThrownBy { sentencesOf(listOf(mapOf("text" to "", "refs" to listOf("hit:1")))) }.hasMessageContaining("no text")
    }

    private val input = listOf(
        mapOf("ref" to "hit:1", "data" to mapOf("evidence" to mapOf("inflow" to 277766.29, "p.forward_pct" to 80), "grainKey" to "TX000000651")),
        mapOf("ref" to "triage:RELATIONSHIP_LENGTH", "data" to mapOf("points" to 5, "description" to "client for 175 days")),
    )

    @Test
    fun acceptsNumbersFromTheInputWithThousandsSeparators() {
        val ok = listOf(Sentence("TX000000651 for K005146: CZK 277,766.29 in, 80% forwarded, client for 175 days, 5 points.", listOf("hit:1")))
        assertThat(checkNumbers(ok, input)).isEqualTo(ok)
    }

    @Test
    fun rejectsANumberTheModelComputed() {
        assertThatThrownBy { checkNumbers(listOf(Sentence("Outflow was 118% of inflow.", listOf("hit:1"))), input) }
            .isInstanceOf(InvalidSummaryException::class.java).hasMessageContaining("118")
    }

    @Test
    fun requiresTheRequiredRef() {
        val sentences = listOf(Sentence("x", listOf("hit:1")))
        assertThat(checkSummary(sentences, known, requiredRef = "hit:1")).isEqualTo(sentences)
        assertThatThrownBy { checkSummary(sentences, known, requiredRef = "hit:2") }
            .isInstanceOf(InvalidSummaryException::class.java).hasMessageContaining("no sentence cites hit:2")
    }

    @Test
    fun acceptsExtraNumbers() {
        val sentences = listOf(Sentence("Raise it to 60.", listOf("hit:1")))
        assertThat(checkNumbers(sentences, input, extra = listOf(60L))).isEqualTo(sentences)
        assertThatThrownBy { checkNumbers(sentences, input) }.hasMessageContaining("60")
    }
}
