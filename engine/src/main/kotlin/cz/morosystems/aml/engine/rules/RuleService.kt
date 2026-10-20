package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.cel.Vocabulary
import cz.morosystems.aml.engine.user.AppUser
import org.springframework.stereotype.Service

class InvalidRuleException(message: String) : RuntimeException(message)

class NotAManagerException(action: String) : RuntimeException("only a manager can $action a rule")

data class ExplainReport(val filled: Int, val failed: Int)

/** Saves rule versions as drafts, gives each one its explanation, and takes a draft through a manager's approval. */
@Service
class RuleService(
    private val rules: RuleRepository,
    private val compiler: RuleCompiler,
    private val explainer: RuleExplainer,
) {
    fun all(): List<RuleVersion> = rules.allVersions()

    fun find(id: Long): RuleVersion? = rules.find(id)

    fun vocabulary() = VocabularyJson(
        tx = Vocabulary.tx.mapValues { it.value.name() },
        client = Vocabulary.client.mapValues { it.value.name() },
        day = Vocabulary.day.mapValues { it.value.name() },
        lists = Vocabulary.lists.mapValues { it.value.name() },
        values = rules.fieldValues(),
    )

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
     * Overwrites the draft [id] with [rule], then writes its explanation again.
     *
     * @return null when there is no version [id]
     * @throws InvalidRuleException when [id] is not a draft, [rule] has another key, or [rule] fails validation as in [save]
     */
    fun update(id: Long, rule: NewRule): RuleVersion? {
        val existing = rules.find(id) ?: return null
        if (existing.status != "draft") throw InvalidRuleException("only a draft can be edited; ${existing.rule.key} v${existing.rule.version} is ${existing.status}")
        if (existing.rule.key != rule.key) throw InvalidRuleException("the draft keeps its key ${existing.rule.key}")
        validate(rule)
        if (!rules.updateDraft(id, rule)) throw InvalidRuleException("${existing.rule.key} v${existing.rule.version} is no longer a draft")
        explain(rules.find(id)!!.rule)
        return rules.find(id)!!
    }

    /**
     * Sends the draft [id] for approval: it turns `pending`, assigned to a manager, and can no longer be edited.
     *
     * @return null when there is no version [id]
     * @throws InvalidRuleException when [id] is not a draft
     */
    fun submit(id: Long): RuleVersion? = transition(id, "draft", "sent for approval", rules::submit)

    /**
     * Activates the pending version [id] and retires the version of its key that was active.
     *
     * @return null when there is no version [id]
     * @throws NotAManagerException when [user] is no manager
     * @throws InvalidRuleException when [id] is not pending
     */
    fun approve(id: Long, user: AppUser): RuleVersion? {
        if (user.role != "MANAGER") throw NotAManagerException("approve")
        return transition(id, "pending", "approved") { rules.approve(it, user.name) }
    }

    /**
     * Sends the pending version [id] back to `draft`, so anyone can edit and send it again.
     *
     * @return null when there is no version [id]
     * @throws NotAManagerException when [user] is no manager
     * @throws InvalidRuleException when [id] is not pending
     */
    fun reject(id: Long, user: AppUser): RuleVersion? {
        if (user.role != "MANAGER") throw NotAManagerException("reject")
        return transition(id, "pending", "rejected", rules::reject)
    }

    /**
     * Deletes the draft [id]. A version sent for approval or already decided stays, for audit.
     *
     * @return false when there is no version [id]
     * @throws InvalidRuleException when [id] is not a draft
     */
    fun delete(id: Long): Boolean {
        val existing = rules.find(id) ?: return false
        if (!rules.deleteDraft(id)) throw InvalidRuleException("only a draft can be deleted; ${existing.rule.key} v${existing.rule.version} is ${existing.status}")
        return true
    }

    private fun transition(id: Long, from: String, verb: String, change: (Long) -> Boolean): RuleVersion? {
        val existing = rules.find(id) ?: return null
        if (!change(id)) throw InvalidRuleException("only a $from version can be $verb; ${existing.rule.key} v${existing.rule.version} is ${existing.status}")
        return rules.find(id)
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
