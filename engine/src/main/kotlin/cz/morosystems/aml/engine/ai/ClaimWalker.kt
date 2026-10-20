package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.summary.Sentence
import cz.morosystems.aml.engine.summary.numbersNotIn

/**
 * A check a ready result failed without being refused, e.g. a number the input does not hold. `at` is where, e.g.
 * `summary[0]`; `numbers` are the offending numbers exactly as the text writes them, so the UI can mark just those.
 */
data class AiWarning(val at: String, val message: String, val numbers: List<String> = emptyList())

/**
 * The checks every AI body passes (ADR-0034, ADR-0043, ADR-0046): each claim cites at least one ref and only refs from
 * the alert's activity, or the output is refused. A number in model text that [input] does not hold, even rounded to
 * a whole number (ADR-0047), is a warning: the
 * result stays ready and the reviewer sees the sentence marked.
 */
fun checkClaims(body: AiBody, known: Set<String>, input: Any?): List<AiWarning> {
    body.claims().forEach { (at, claim) ->
        if (claim.refs.isEmpty()) throw InvalidAiOutputException("$at cites nothing")
        val unknown = claim.refs.filterNot { it in known }
        if (unknown.isNotEmpty()) throw InvalidAiOutputException("$at cites unknown refs $unknown")
    }
    return (body.claims().mapValues { it.value.text } + body.texts()).mapNotNull { (at, text) ->
        numbersNotIn(text, input, wholeRounding = true).takeIf { it.isNotEmpty() }?.let { AiWarning(at, "numbers not in the input: $it", it) }
    }
}

/** Reads a required, non-blank string field of a model object. */
fun stringOf(map: Map<*, *>, field: String, at: String): String =
    (map[field] as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: throw InvalidAiOutputException("$at has no $field")

/** Reads a string field that must be one of [allowed]; the JSON schema enforces it, code checks again. */
fun enumOf(map: Map<*, *>, field: String, at: String, allowed: Set<String>): String =
    stringOf(map, field, at).also { if (it !in allowed) throw InvalidAiOutputException("$at has $field '$it', expected one of $allowed") }

/** Reads `{text, refs}` from one model object. */
fun claimOf(raw: Any?, at: String): Sentence {
    val map = raw as? Map<*, *> ?: throw InvalidAiOutputException("$at is not an object")
    val refs = (map["refs"] as? List<*>)?.map { it as? String ?: throw InvalidAiOutputException("$at has a ref that is not a string") }
        ?: throw InvalidAiOutputException("$at has no refs list")
    return Sentence(stringOf(map, "text", at), refs)
}

/** Reads a list of objects whose size must lie in [sizes]. */
fun objectsOf(raw: Any?, at: String, sizes: IntRange): List<Map<*, *>> {
    val list = raw as? List<*> ?: throw InvalidAiOutputException("$at is not a list")
    if (list.size !in sizes) throw InvalidAiOutputException("$at has ${list.size} items, expected ${sizes.first} to ${sizes.last}")
    return list.mapIndexed { i, item -> item as? Map<*, *> ?: throw InvalidAiOutputException("$at[$i] is not an object") }
}
