package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.alert.AlertRepository
import cz.morosystems.aml.engine.bedrock.Bedrock
import cz.morosystems.aml.engine.bedrock.BedrockException
import cz.morosystems.aml.engine.summary.AlertActivity
import cz.morosystems.aml.engine.summary.AlertNotFoundException
import cz.morosystems.aml.engine.summary.InvalidSummaryException
import org.springframework.stereotype.Component
import software.amazon.awssdk.core.exception.SdkException
import tools.jackson.core.JacksonException
import tools.jackson.databind.json.JsonMapper

/**
 * The one call path for model output on an alert (ADR-0043): collect the activity (plus the code-computed facts when the kind asks for them), ask Bedrock through the kind's fixed
 * schema, parse, walk the claims, store and return the envelope. A refused reply is stored as `rejected`, a model or
 * transport error as `failed`; neither is repaired or retried here.
 */
@Component
class AiGenerator(
    private val alerts: AlertRepository,
    private val activity: AlertActivity,
    private val facts: AlertFacts,
    private val bedrock: Bedrock,
    private val results: AiResultRepository,
) {
    private val json = JsonMapper()

    /** The newest stored result of the kind, whatever prompt made it (ADR-0045); a new one is generated only on request. */
    fun latest(alertId: Long, kind: AiKind<*>): AiResult? = results.latest(alertId, kind.name)

    fun generate(alertId: Long, kind: AiKind<*>): AiResult {
        val alert = alerts.find(alertId) ?: throw AlertNotFoundException(alertId)
        val items = activity.collect(alertId) + if (kind.withFacts) facts.collect(alertId) else emptyList()
        val input = json.writeValueAsString(mapOf("alert" to alert, "activity" to items))
        val disposition = items.firstOrNull { it.ref == "triage:decision" }?.data?.get("disposition") as String?
        val system = kind.system(disposition)
        val promptHash = kind.promptHash(disposition)
        fun store(status: String, body: Any?, error: String?) =
            results.save(alertId, kind.name, status, body, error, bedrock.modelId, promptHash, sha256(input))

        val reply = try {
            bedrock.askJson(system, input, "alert_${kind.name}", kind.schema)
        } catch (e: BedrockException) {
            return store(FAILED, null, e.message)
        } catch (e: SdkException) {
            return store(FAILED, null, e.message)
        }
        val (body, warnings) = try {
            kind.parse(json.readValue(reply, Map::class.java)).let {
                // The prompt rides along so a number it states itself ("within 24 hours") counts as known.
                it to checkClaims(it, items.map { item -> item.ref }.toSet(), listOf(json.readValue(input, Map::class.java), system))
            }
        } catch (e: JacksonException) {
            return store(REJECTED, null, "reply is not JSON: ${e.originalMessage}")
        } catch (e: InvalidAiOutputException) {
            return store(REJECTED, null, e.message)
        } catch (e: InvalidSummaryException) {
            return store(REJECTED, null, e.message)
        }
        return store(READY, json.convertValue(body, Map::class.java) + ("warnings" to warnings), null)
    }
}
