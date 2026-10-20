package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.EngineProperties
import cz.morosystems.aml.engine.ai.sha256
import cz.morosystems.aml.engine.bedrock.Bedrock
import cz.morosystems.aml.engine.cel.Vocabulary
import org.slf4j.LoggerFactory
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Service
import tools.jackson.core.JacksonException
import tools.jackson.databind.json.JsonMapper
import kotlin.io.path.readText

data class SuggestionRequest(val reason: String?)

/** Proposes a rule change from a reviewer's false-positive reason. The model only drafts it; code checks it and nothing is saved. */
@Service
class SuggestionService(
    private val repository: SuggestionRepository,
    private val checker: SuggestionChecker,
    private val impact: SuggestionImpact,
    private val bedrock: Bedrock,
    private val props: EngineProperties,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val json = JsonMapper()
    private val classpathSystem = ClassPathResource("prompts/rule-suggestion.md").getContentAsString(Charsets.UTF_8)

    private fun system(): String = props.promptsDir?.resolve(PROMPT_FILE)?.readText() ?: classpathSystem

    fun suggest(alertId: Long, reason: String): Suggestion {
        val system = system()
        val promptHash = sha256(system + SCHEMA).take(12)
        return suggest(alertId, reason, system, promptHash).copy(promptHash = promptHash)
    }

    private fun suggest(alertId: Long, reason: String, system: String, promptHash: String): Suggestion {
        val context = repository.context(alertId, reason.trim())
        val input = json.writeValueAsString(inputOf(context))
        val reply = bedrock.askJson(system, input, "rule_suggestion", SCHEMA)
        val parsed = try {
            json.readValue(reply, Map::class.java)
        } catch (e: JacksonException) {
            throw InvalidSuggestionException("reply is not JSON: ${e.originalMessage}")
        }
        val checked = try {
            checker.check(parsed, json.readValue(input, Map::class.java), context)
        } catch (e: InvalidSuggestionException) {
            log.warn("alert {} [prompt {}]: suggestion rejected by the checks: {}; reply: {}", alertId, promptHash, e.message, reply)
            throw e
        }
        val draft = checked.draft
        if (draft == null) {
            log.info("alert {} [prompt {}]: no suggestion, the model answered none: {}", alertId, promptHash, checked.suggestion.explanation.joinToString(" ") { it.text })
            return checked.suggestion
        }
        val measured = impact.measure(draft, context)
        val declined = impact.declineReason(measured)
        log.info("alert {} [prompt {}]: {} {} v{}, {}; impact {}", alertId, promptHash, if (declined == null) "suggests" else "declines", draft.definition.key, draft.definition.version, declined ?: "passes the gates", measured)
        return checked.suggestion.copy(kind = if (declined == null) checked.suggestion.kind else "none", impact = measured, declined = declined)
    }

    private fun inputOf(context: SuggestionContext): Map<String, Any?> {
        val clientId = context.alert.clientId
        val resolved = checker.resolve(context.rules, context)
        val rules = context.hitKeys.sorted().mapNotNull { key ->
            val base = resolved.clientsByRule.entries.firstOrNull { it.key.key == key && clientId in it.value }?.key ?: return@mapNotNull null
            key to mapOf(
                "layer" to base.layer.name.lowercase(),
                "grain" to base.grain.name.lowercase(),
                "anchor" to base.anchor,
                "condition" to base.condition,
                "variables" to base.variables.map(checker::suggestedVariable),
                "params" to base.params.mapValues { (_, p) -> mapOf("value" to p.value, "unit" to p.unit.name.lowercase()) },
            )
        }.toMap()
        return mapOf(
            "reason" to mapOf("ref" to "reason", "kind" to "reviewer_reason", "data" to mapOf("text" to context.reason)),
            "alert" to context.alert,
            "activity" to context.activity,
            "rules" to rules,
            "client" to mapOf("ref" to CLIENT_REF, "kind" to "client", "data" to context.clients.firstOrNull { it["id"] == clientId }),
            "triage" to context.triage?.let { mapOf("ref" to TRIAGE_REF, "kind" to "triage", "data" to it) },
            "assessment" to context.assessment?.let { mapOf("ref" to ASSESSMENT_REF, "kind" to "ai_assessment", "data" to it) },
            "existingRules" to context.existingRules.map { v ->
                mapOf(
                    "ref" to v.ref(), "key" to v.rule.key, "version" to v.rule.version, "status" to v.status,
                    "layer" to v.rule.layer.name.lowercase(), "scopeClientId" to v.rule.scopeClientId, "replacesKey" to v.rule.replacesKey,
                    "condition" to v.rule.condition, "params" to v.rule.params.mapValues { (_, p) -> mapOf("value" to p.value, "unit" to p.unit.name.lowercase()) },
                    "explanation" to v.explanation,
                )
            },
            "vocabulary" to mapOf(
                "tx" to Vocabulary.tx.mapValues { it.value.name() },
                "client" to Vocabulary.client.mapValues { it.value.name() },
                "day" to Vocabulary.day.mapValues { it.value.name() },
                "lists" to Vocabulary.lists.keys.sorted(),
                "values" to context.values,
            ),
        )
    }

    private companion object {
        const val PROMPT_FILE = "rule-suggestion.md"
        val SCHEMA = """
            {"type":"object","additionalProperties":false,
             "required":["kind","ruleKey","layer","condition","variables","params","explanation","ruleExplanation"],"properties":{
              "kind":{"type":"string","enum":["rule_version","none"]},
              "ruleKey":{"type":"string"},
              "layer":{"type":"string","enum":["client","company"]},
              "condition":{"type":["string","null"]},
              "variables":{"type":"array","items":{"type":"object","additionalProperties":false,
               "required":["position","name","agg","field","filter","windowKind","windowFrom","windowTo"],"properties":{
                "position":{"type":"integer"},"name":{"type":"string"},"agg":{"type":"string"},"field":{"type":"string"},
                "filter":{"type":"string"},"windowKind":{"type":"string"},
                "windowFrom":{"type":["string","null"]},"windowTo":{"type":["string","null"]}}}},
              "params":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","value","unit"],"properties":{
               "name":{"type":"string"},"value":{"type":"number"},"unit":{"type":["string","null"]}}}},
              "ruleExplanation":{"type":["string","null"]},
              "explanation":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["text","refs"],"properties":{
               "text":{"type":"string"},
               "refs":{"type":"array","items":{"type":"string"}}}}}}}
        """.trimIndent()
    }
}
