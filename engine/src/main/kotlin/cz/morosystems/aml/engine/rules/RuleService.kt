package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompiler
import org.springframework.stereotype.Service

class InvalidRuleException(message: String) : RuntimeException(message)

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

    private fun explain(rule: RuleDefinition): Boolean {
        val explanation = explainer.explain(rule, rule.scopeSegmentId?.let(rules::segmentName)) ?: return false
        rules.saveExplanation(rule.id, explanation)
        return true
    }

    private fun validate(rule: NewRule) {
        if (rule.key.isBlank()) throw InvalidRuleException("a rule needs a key")
        if (rule.author.isBlank()) throw InvalidRuleException("a rule needs an author")
        if (rule.condition.isBlank()) throw InvalidRuleException("a rule needs a condition")
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
        compiler.compile(
            RuleDefinition(
                0, rule.key, 0, rule.alertType, rule.layer, rule.scopeSegmentId, rule.scopeClientId, rule.grain, rule.anchor,
                rule.condition, rule.replacesKey, rule.variables, rule.params,
            ),
            rule.params.keys,
        )
    }
}
