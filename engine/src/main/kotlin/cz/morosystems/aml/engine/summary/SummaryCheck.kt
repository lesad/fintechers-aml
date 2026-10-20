package cz.morosystems.aml.engine.summary

import java.math.BigDecimal
import java.math.RoundingMode

class InvalidSummaryException(message: String) : RuntimeException(message)

/** Reads `[{text, refs}]` from parsed JSON, failing on any other shape. */
fun sentencesOf(raw: Any?): List<Sentence> {
    val list = raw as? List<*> ?: throw InvalidSummaryException("sentences is not a list")
    return list.mapIndexed { i, item ->
        val map = item as? Map<*, *> ?: throw InvalidSummaryException("sentence $i is not an object")
        val text = (map["text"] as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: throw InvalidSummaryException("sentence $i has no text")
        val refs = (map["refs"] as? List<*>)?.map { it as? String ?: throw InvalidSummaryException("sentence $i has a ref that is not a string") }
            ?: throw InvalidSummaryException("sentence $i has no refs list")
        Sentence(text, refs)
    }
}

/** The model's output is untrusted: every sentence must cite at least one ref, and only refs from the alert's activity. With [requiredRef], some sentence must cite it. [noun] names the text in error messages. */
fun checkSummary(sentences: List<Sentence>, known: Set<String>, maxSentences: Int = MAX_SENTENCES, requiredRef: String? = null, noun: String = "summary"): List<Sentence> {
    if (sentences.isEmpty()) throw InvalidSummaryException("$noun has no sentences")
    if (sentences.size > maxSentences) throw InvalidSummaryException("$noun has ${sentences.size} sentences, at most $maxSentences allowed")
    sentences.forEachIndexed { i, s ->
        if (s.refs.isEmpty()) throw InvalidSummaryException("sentence $i cites nothing")
        val unknown = s.refs.filterNot { it in known }
        if (unknown.isNotEmpty()) throw InvalidSummaryException("sentence $i cites unknown refs $unknown")
    }
    if (requiredRef != null && sentences.none { requiredRef in it.refs }) throw InvalidSummaryException("no sentence cites $requiredRef")
    return sentences
}

/**
 * The model does no arithmetic: every number it writes must appear in [input] as is. Amounts are CZK there already.
 * [extra] values (a suggestion's proposed parameters) are known too.
 * Digits inside identifiers (TX000000651, K005146) are not numbers.
 */
fun checkNumbers(sentences: List<Sentence>, input: Any?, extra: Collection<Number> = emptyList()): List<Sentence> {
    sentences.forEachIndexed { i, s ->
        val unknown = numbersNotIn(s.text, input, extra)
        if (unknown.isNotEmpty()) throw InvalidSummaryException("sentence $i has numbers not in the input: $unknown")
    }
    return sentences
}

/**
 * The numbers in [text] that appear neither in [input] nor in [extra]. With [wholeRounding], a whole number also
 * matches an input number that rounds to it (`1,032,539` for `1032539.3`): rounded, not made up (ADR-0047).
 */
fun numbersNotIn(text: String, input: Any?, extra: Collection<Number> = emptyList(), wholeRounding: Boolean = false): List<String> {
    val known = numbersIn(input) + extra.map { BigDecimal(it.toString()) }
    val rounded = if (wholeRounding) known.map { it.setScale(0, RoundingMode.HALF_UP) } else emptyList()
    return NUMBER.findAll(text).map { it.value }.filterNot { n ->
        val quoted = BigDecimal(n.replace(",", ""))
        known.any { it.compareTo(quoted) == 0 } || (quoted.scale() <= 0 && rounded.any { it.compareTo(quoted) == 0 })
    }.toList()
}

private fun numbersIn(value: Any?): List<BigDecimal> = when (value) {
    is Number -> listOf(BigDecimal(value.toString()))
    is String -> NUMBER.findAll(value).map { BigDecimal(it.value.replace(",", "")) }.toList()
    is Map<*, *> -> value.values.flatMap(::numbersIn)
    is Iterable<*> -> value.flatMap(::numbersIn)
    else -> emptyList()
}

private val NUMBER = Regex("""(?<![\p{L}\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\p{L}\d.,])\d+(?:\.\d+)?""")

private const val MAX_SENTENCES = 3
