package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.ai.AiBody
import cz.morosystems.aml.engine.ai.AiGenerator
import cz.morosystems.aml.engine.ai.AiKind
import cz.morosystems.aml.engine.ai.AiResult
import cz.morosystems.aml.engine.ai.READY
import org.springframework.stereotype.Service

class AlertNotFoundException(alertId: Long) : RuntimeException("alert $alertId not found")

/** What happened on an alert, in two or three sentences; each one cites the activity it restates. */
data class SummaryBody(val sentences: List<Sentence>) : AiBody {
    override fun claims() = sentences.withIndex().associate { (i, s) -> "sentences[$i]" to s }
}

/** Writes the analyst-facing summary of an alert from its activity. The model only writes text; code checks every citation. */
@Service
class SummaryService(private val generator: AiGenerator) {
    fun latest(alertId: Long): AiResult? = generator.latest(alertId, KIND)

    fun generate(alertId: Long): AiResult = generator.generate(alertId, KIND)

    /** The latest ready summary as one paragraph; null when none ran or the latest was refused. */
    fun latestText(alertId: Long): String? =
        latest(alertId)?.takeIf { it.status == READY }?.let { result ->
            ((result.body as? Map<*, *>)?.get("sentences") as? List<*>)?.joinToString(" ") { (it as? Map<*, *>)?.get("text").toString() }
        }

    companion object {
        private val SCHEMA = """
            {"type":"object","additionalProperties":false,"required":["sentences"],"properties":{
              "sentences":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["text","refs"],"properties":{
                "text":{"type":"string"},
                "refs":{"type":"array","items":{"type":"string"}}}}}}}
        """.trimIndent()

        val KIND = AiKind("summary", "prompts/alert-summary.md", SCHEMA) { reply ->
            val sentences = sentencesOf(reply["sentences"])
            if (sentences.isEmpty()) throw InvalidSummaryException("summary has no sentences")
            if (sentences.size > MAX_SUMMARY_SENTENCES) {
                throw InvalidSummaryException("summary has ${sentences.size} sentences, at most $MAX_SUMMARY_SENTENCES allowed")
            }
            SummaryBody(sentences)
        }

        private const val MAX_SUMMARY_SENTENCES = 3
    }
}
