package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.summary.Sentence
import cz.morosystems.aml.engine.summary.numbersNotIn

/**
 * The checks every AI body passes (ADR-0034, ADR-0043): each claim cites at least one ref, only refs from the alert's
 * activity, and every number in model text appears in [input]. The output is refused, never repaired.
 */
fun checkClaims(body: AiBody, known: Set<String>, input: Any?) {
    body.claims().forEach { (at, claim) ->
        if (claim.refs.isEmpty()) throw InvalidAiOutputException("$at cites nothing")
        val unknown = claim.refs.filterNot { it in known }
        if (unknown.isNotEmpty()) throw InvalidAiOutputException("$at cites unknown refs $unknown")
        checkNumbers(at, claim.text, input)
    }
    body.texts().forEach { (at, text) -> checkNumbers(at, text, input) }
}

private fun checkNumbers(at: String, text: String, input: Any?) {
    val unknown = numbersNotIn(text, input)
    if (unknown.isNotEmpty()) throw InvalidAiOutputException("$at has numbers not in the input: $unknown")
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
