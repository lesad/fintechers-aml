package cz.morosystems.aml.engine.assessment

import cz.morosystems.aml.engine.ai.AiBody
import cz.morosystems.aml.engine.ai.AiGenerator
import cz.morosystems.aml.engine.ai.AiKind
import cz.morosystems.aml.engine.ai.AiResult
import cz.morosystems.aml.engine.ai.InvalidAiOutputException
import cz.morosystems.aml.engine.ai.claimOf
import cz.morosystems.aml.engine.ai.enumOf
import cz.morosystems.aml.engine.ai.objectsOf
import cz.morosystems.aml.engine.ai.stringOf
import cz.morosystems.aml.engine.summary.Sentence
import org.springframework.stereotype.Service

/** One thing the facts leave open: the question, what would point to suspicion, the normal reading, what settles it, whom to ask. */
data class OpenPoint(val question: Sentence, val suspicious: String, val normal: String, val wouldSettle: String, val askWho: String)

/**
 * The AI Rating: advice shown next to the rule rating (ADR-0043). Triage, priority and queue order never read it
 * (ADR-0032, ADR-0034).
 */
data class AssessmentBody(val rating: String, val verdict: String, val summary: List<Sentence>, val openPoints: List<OpenPoint>) : AiBody {
    override fun claims(): Map<String, Sentence> =
        summary.withIndex().associate { (i, s) -> "summary[$i]" to s } +
            openPoints.withIndex().associate { (i, p) -> "openPoints[$i].question" to p.question }

    override fun texts(): Map<String, String> =
        openPoints.withIndex().flatMap { (i, p) ->
            listOf("openPoints[$i].suspicious" to p.suspicious, "openPoints[$i].normal" to p.normal, "openPoints[$i].wouldSettle" to p.wouldSettle)
        }.toMap()
}

/** Rates an alert for the reviewer: a rating, the verdict it resembles, a short summary and the open points to settle. */
@Service
class AssessmentService(private val generator: AiGenerator) {
    fun latest(alertId: Long): AiResult? = generator.latest(alertId, KIND)

    fun generate(alertId: Long): AiResult = generator.generate(alertId, KIND)

    companion object {
        val RATINGS = setOf("high", "medium", "low")
        val VERDICTS = setOf(
            "pass_through", "funnel", "mule", "structuring", "pep_proceeds",
            "regular_supplier", "salary_or_payroll", "own_accounts", "seasonal_business", "unclear",
        )
        val ASK_WHO = setOf("client", "account_manager", "analyst")

        private fun enumJson(values: Set<String>) = values.joinToString(",", "[", "]") { "\"$it\"" }

        private const val SENTENCE = """{"type":"object","additionalProperties":false,"required":["text","refs"],"properties":{"text":{"type":"string"},"refs":{"type":"array","items":{"type":"string"}}}}"""

        private val SCHEMA = """
            {"type":"object","additionalProperties":false,"required":["rating","verdict","summary","openPoints"],"properties":{
              "rating":{"type":"string","enum":${enumJson(RATINGS)}},
              "verdict":{"type":"string","enum":${enumJson(VERDICTS)}},
              "summary":{"type":"array","items":$SENTENCE},
              "openPoints":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["question","suspicious","normal","wouldSettle","askWho"],"properties":{
                "question":$SENTENCE,
                "suspicious":{"type":"string"},"normal":{"type":"string"},"wouldSettle":{"type":"string"},
                "askWho":{"type":"string","enum":${enumJson(ASK_WHO)}}}}}}}
        """.trimIndent()

        private val FOCUS_FILES = mapOf(
            "AUTO_CLOSE" to "prompts/assessment-focus-auto-close.md",
            "REVIEW_LOW" to "prompts/assessment-focus-review.md",
            "REVIEW_MEDIUM" to "prompts/assessment-focus-review.md",
            "REVIEW_HIGH" to "prompts/assessment-focus-review.md",
            "ESCALATE" to "prompts/assessment-focus-escalate.md",
        )

        val KIND = AiKind("assessment", "prompts/alert-assessment.md", SCHEMA, FOCUS_FILES, withFacts = true) { reply ->
            AssessmentBody(
                rating = enumOf(reply, "rating", "assessment", RATINGS),
                verdict = enumOf(reply, "verdict", "assessment", VERDICTS),
                summary = objectsOf(reply["summary"], "summary", 1..3).mapIndexed { i, s -> claimOf(s, "summary[$i]") },
                openPoints = objectsOf(reply["openPoints"], "openPoints", 1..3).mapIndexed { i, p ->
                    val at = "openPoints[$i]"
                    OpenPoint(
                        question = claimOf(p["question"], "$at.question"),
                        suspicious = stringOf(p, "suspicious", at),
                        normal = stringOf(p, "normal", at),
                        wouldSettle = stringOf(p, "wouldSettle", at),
                        askWho = enumOf(p, "askWho", at, ASK_WHO),
                    )
                },
            )
        }
    }
}
