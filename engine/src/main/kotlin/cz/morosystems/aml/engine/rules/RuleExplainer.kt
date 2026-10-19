package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.bedrock.Bedrock
import cz.morosystems.aml.engine.plain
import cz.morosystems.aml.engine.summary.numbersNotIn
import java.security.MessageDigest
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component

@ConfigurationProperties("rules")
data class RulesProperties(val explanationModelId: String)

data class Explanation(val text: String, val modelId: String, val promptHash: String)

/** Writes the one-line plain-English explanation of a rule version; the model only writes text, code checks it. */
@Component
class RuleExplainer(private val bedrock: Bedrock, private val properties: RulesProperties) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val system = ClassPathResource("prompts/rule-explanation.md").getContentAsString(Charsets.UTF_8)

    /** Null when Bedrock fails or the reply does not pass the checks; never throws, so a save never depends on the model. */
    fun explain(rule: RuleDefinition, segmentName: String? = null): Explanation? {
        val prompt = explanationPrompt(rule, segmentName)
        val text = try {
            bedrock.ask(system, prompt, properties.explanationModelId).trim()
        } catch (e: Exception) {
            log.warn("rule {} v{}: no explanation, Bedrock failed: {}", rule.key, rule.version, e.message)
            return null
        }
        val problem = problemWith(text, prompt)
        if (problem != null) {
            log.warn("rule {} v{}: explanation rejected ({}): {}", rule.key, rule.version, problem, text)
            return null
        }
        return Explanation(text, properties.explanationModelId, sha256(system + prompt))
    }

    private fun problemWith(text: String, input: String): String? = when {
        text.isBlank() -> "blank"
        text.length > MAX_LENGTH -> "longer than $MAX_LENGTH characters"
        !text.startsWith("Flags") -> "does not start with Flags"
        "```" in text -> "contains a code fence"
        else -> numbersNotIn(text, input).takeIf { it.isNotEmpty() }?.let { "numbers not in the input: $it" }
    }

    private fun sha256(text: String) =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

    private companion object {
        const val MAX_LENGTH = 500
    }
}

internal fun explanationPrompt(rule: RuleDefinition, segmentName: String?): String = buildList {
    val scope = when (rule.layer) {
        Layer.COMPANY -> "company-wide"
        Layer.SEGMENT -> "segment ${segmentName ?: rule.scopeSegmentId}"
        Layer.CLIENT -> "client ${rule.scopeClientId}"
    }
    add("Rule ${rule.key} v${rule.version}, alert type ${rule.alertType}, $scope.")
    add("Evaluated per: ${rule.grain.name.lowercase().replace('_', ' ')}.")
    rule.anchor?.let { add("Anchor transactions: $it") }
    add("Condition: " + rule.condition.replace(" >= ", " IS AT LEAST ").replace(" > ", " IS MORE THAN "))
    rule.variables.sortedBy { it.position }.forEach {
        add("Variable ${it.name} = ${it.agg.name.lowercase()} of ${it.field} over transactions where ${it.filter}, window: ${windowWords(it.window)}")
    }
    rule.params.toSortedMap().forEach { (name, p) ->
        val reading = when (p.unit) {
            ParamUnit.AMOUNT -> "${plain(p.value)} CZK"
            ParamUnit.PERCENT -> "${plain(p.value)} percent"
            ParamUnit.MULTIPLE -> "${plain(p.value)} times"
            ParamUnit.COUNT -> plain(p.value)
        }
        add("Parameter p.$name = $reading")
    }
}.joinToString("\n")

private fun windowWords(window: Window): String = when {
    window is Window.Day -> "the client's calendar day"
    window !is Window.Relative -> error("unknown window $window")
    window.from.isNegative && window.to.isZero -> "${span(window.from.negated())} before the anchor transaction, up to it"
    window.from.isZero && !window.to.isNegative -> "from the anchor transaction to ${span(window.to)} after it"
    else -> "from ${span(window.from.negated())} before to ${span(window.to)} after the anchor transaction"
}

private fun span(duration: Duration) =
    if (duration.toMinutesPart() == 0) "${duration.toHours()} hours" else "${duration.toMinutes()} minutes"
