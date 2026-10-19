package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.alert.AlertRepository
import cz.morosystems.aml.engine.bedrock.Bedrock
import java.security.MessageDigest
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Service
import tools.jackson.core.JacksonException
import tools.jackson.databind.json.JsonMapper

class AlertNotFoundException(alertId: Long) : RuntimeException("alert $alertId not found")

/** Writes the analyst-facing summary of an alert from its activity. The model only writes text; code checks every citation. */
@Service
class SummaryService(
    private val alerts: AlertRepository,
    private val activity: AlertActivity,
    private val bedrock: Bedrock,
    private val summaries: SummaryRepository,
) {
    private val json = JsonMapper()
    private val system = ClassPathResource("prompts/alert-summary.md").getContentAsString(Charsets.UTF_8)

    fun latest(alertId: Long): Summary? = summaries.latest(alertId)

    fun generate(alertId: Long): Summary {
        val alert = alerts.find(alertId) ?: throw AlertNotFoundException(alertId)
        val items = activity.collect(alertId)
        val input = json.writeValueAsString(mapOf("alert" to alert, "activity" to items))
        val reply = bedrock.askJson(system, input, "alert_summary", SCHEMA)
        val parsed = try {
            json.readValue(reply, Map::class.java)
        } catch (e: JacksonException) {
            throw InvalidSummaryException("reply is not JSON: ${e.originalMessage}")
        }
        val sentences = checkNumbers(checkSummary(sentencesOf(parsed["sentences"]), items.map { it.ref }.toSet()), json.readValue(input, Map::class.java))
        return summaries.save(alertId, sentences, bedrock.modelId, sha256(system + SCHEMA + input))
    }

    private fun sha256(text: String) =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

    private companion object {
        val SCHEMA = """
            {"type":"object","additionalProperties":false,"required":["sentences"],"properties":{
              "sentences":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["text","refs"],"properties":{
                "text":{"type":"string"},
                "refs":{"type":"array","items":{"type":"string"}}}}}}}
        """.trimIndent()
    }
}
