package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompiler
import org.springframework.stereotype.Service

class InvalidRuleException(message: String) : RuntimeException(message)

data class ExplainReport(val filled: Int, val failed: Int)

/** Saves rule versions as drafts and gives each one its explanation. */
@Service
class RuleService(
    private val rules: RuleRepository,
    private val compiler: RuleCompiler,
    private val explainer: RuleExplainer,
) {
    fun all(): List<RuleVersion> = rules.allVersions()

    fun find(id: Long): RuleVersion? = rules.find(id)

    /**
     * Validates [rule], stores it as the next draft version of its key, then asks for its explanation.
     *
     * The draft is committed before the model is called, so a Bedrock failure leaves it saved with no explanation.
     *
     * @throws InvalidRuleException when the rule is incomplete or changes what an earlier version of its key fixed
     * @throws cz.morosystems.aml.engine.cel.RuleCompileException when a CEL expression does not type-check
     */
    fun save(rule: NewRule): RuleVersion {
        validate(rule)
        val id = rules.insertDraft(rule)
        explain(rules.find(id)!!.rule)
        return rules.find(id)!!
    }

    /**
     * Explains [rule] as its next version would read, without storing anything.
     *
     * @return null when the model gave no usable explanation
     * @throws InvalidRuleException when the rule could not be saved either
     * @throws cz.morosystems.aml.engine.cel.RuleCompileException when a CEL expression does not type-check
     */
    fun preview(rule: NewRule): Explanation? {
        validate(rule)
        val version = (rules.latestOf(rule.key)?.version ?: 0) + 1
        return explainer.explain(rule.definition(version), rule.scopeSegmentId?.let(rules::segmentName))
    }

    /** Writes the explanation of every version that has none; never overwrites one. */
    fun explainMissing(): ExplainReport {
        val filled = rules.missingExplanations().count(::explain)
        return ExplainReport(filled = filled, failed = rules.missingExplanations().size)
    }

    private fun explain(rule: RuleDefinition): Boolean {
        val explanation = explainer.explain(rule, rule.scopeSegmentId?.let(rules::segmentName)) ?: return false
        rules.saveExplanation(rule.id, explanation)
        return true
    }

    private fun validate(rule: NewRule) {
        if (rule.key.isBlank()) throw InvalidRuleException("a rule needs a key")
        if (rule.author.isBlank()) throw InvalidRuleException("a rule needs an author")
        if (rule.condition.isBlank()) throw InvalidRuleException("a rule needs a condition")
        if (!rules.alertTypeExists(rule.alertType)) throw InvalidRuleException("unknown alert type ${rule.alertType}")
        if (rule.scopeSegmentId != null && rules.segmentName(rule.scopeSegmentId) == null) {
            throw InvalidRuleException("unknown segment ${rule.scopeSegmentId}")
        }
        when (rule.layer) {
            Layer.COMPANY -> if (rule.scopeSegmentId != null || rule.scopeClientId != null) throw InvalidRuleException("a company rule has no segment or client")
            Layer.SEGMENT -> if (rule.scopeSegmentId == null || rule.scopeClientId != null) throw InvalidRuleException("a segment rule needs a segment and no client")
            Layer.CLIENT -> if (rule.scopeClientId == null || rule.scopeSegmentId != null) throw InvalidRuleException("a client rule needs a client and no segment")
        }
        if ((rule.grain == Grain.CLIENT_ANCHOR) != (rule.anchor != null)) {
            throw InvalidRuleException("an anchor is required for the client_anchor grain and only there")
        }
        rules.latestOf(rule.key)?.let { earlier ->
            fun keeps(field: String, before: Any?, after: Any?) {
                if (before != after) throw InvalidRuleException("${rule.key} keeps $field ${before ?: "none"}; save a new key to change it")
            }
            keeps("alert type", earlier.alertType, rule.alertType)
            keeps("layer", earlier.layer.name.lowercase(), rule.layer.name.lowercase())
            keeps("segment", earlier.scopeSegmentId, rule.scopeSegmentId)
            keeps("client", earlier.scopeClientId, rule.scopeClientId)
            keeps("replaces", earlier.replacesKey, rule.replacesKey)
        }
        compiler.compile(rule.definition(0), rule.params.keys)
    }
}

private fun NewRule.definition(version: Int) = RuleDefinition(
    0, key, version, alertType, layer, scopeSegmentId, scopeClientId, grain, anchor, condition, replacesKey, variables, params,
)
