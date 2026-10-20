package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.cel.Vocabulary
import cz.morosystems.aml.engine.user.AppUser
import cz.morosystems.aml.engine.user.APPROVER_ROLES
import cz.morosystems.aml.engine.user.COMPLIANCE_MANAGER
import cz.morosystems.aml.engine.user.COMPLIANCE_OFFICER
import cz.morosystems.aml.engine.user.UserRepository
import org.springframework.stereotype.Service

class InvalidRuleException(message: String) : RuntimeException(message)

class NotAnApproverException(message: String) : RuntimeException(message)

data class ExplainReport(val filled: Int, val failed: Int)

/** Saves rule versions as drafts, gives each one its explanation, and takes a draft through a compliance officer's approval. */
@Service
class RuleService(
    private val rules: RuleRepository,
    private val compiler: RuleCompiler,
    private val explainer: RuleExplainer,
    private val users: UserRepository,
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
     * @throws InvalidRuleException when the rule has no change reason, is incomplete or changes what an earlier version
     * of its key fixed
     * @throws cz.morosystems.aml.engine.cel.RuleCompileException when a CEL expression does not type-check
     */
    fun save(rule: NewRule): RuleVersion {
        if (rules.latestOf(rule.key) != null) requireReason(rule)
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
        if (existing.rule.version > 1) requireReason(rule)
        validate(rule)
        if (!rules.updateDraft(id, rule)) throw InvalidRuleException("${existing.rule.key} v${existing.rule.version} is no longer a draft")
        explain(rules.find(id)!!.rule)
        return rules.find(id)!!
    }

    /**
     * Sends the draft [id] for approval to [approverId] (four eyes, ADR-0052): a compliance officer or compliance
     * manager who neither wrote it nor is [sender]; without one, the first compliance officer who is neither. It turns
     * `pending` and can no longer be edited.
     *
     * @return null when there is no version [id]
     * @throws InvalidRuleException when [id] is not a draft, or the approver is missing, too junior, its author or the sender
     */
    fun submit(id: Long, approverId: Long? = null, sender: AppUser? = null): RuleVersion? {
        val existing = rules.find(id) ?: return null
        val excluded = setOfNotNull(existing.author, sender?.name)
        val approver = if (approverId == null) {
            users.all().firstOrNull { it.role == COMPLIANCE_OFFICER && it.name !in excluded }
        } else {
            users.find(approverId)
        }
        if (approver == null || approver.role !in APPROVER_ROLES || approver.name in excluded) {
            throw InvalidRuleException(
                "${existing.rule.key} v${existing.rule.version} needs an approver: a compliance officer or compliance manager who neither wrote nor sends it",
            )
        }
        return transition(id, "draft", "sent for approval") { rules.submit(it, approver.id) }
    }

    /**
     * Activates the pending version [id] and retires the version of its key that was active.
     *
     * @return null when there is no version [id]
     * @throws NotAnApproverException when [user] may not decide it, see [checkApprover]
     * @throws InvalidRuleException when [id] is not pending
     */
    fun approve(id: Long, user: AppUser): RuleVersion? {
        checkApprover(id, user, "approve")
        return transition(id, "pending", "approved") { rules.approve(it, user.name) }
    }

    /**
     * Sends the pending version [id] back to `draft`, so anyone can edit and send it again.
     *
     * @return null when there is no version [id]
     * @throws NotAnApproverException when [user] may not decide it, see [checkApprover]
     * @throws InvalidRuleException when [id] is not pending
     */
    fun reject(id: Long, user: AppUser): RuleVersion? {
        checkApprover(id, user, "reject")
        return transition(id, "pending", "rejected", rules::reject)
    }

    /**
     * Four eyes: a compliance officer decides any version they did not write; a compliance manager only the one sent
     * to them; nobody decides their own.
     */
    private fun checkApprover(id: Long, user: AppUser, verb: String) {
        val existing = rules.find(id) ?: return
        if (user.role !in APPROVER_ROLES) throw NotAnApproverException("only a compliance officer or compliance manager can $verb a rule")
        if (existing.author == user.name) throw NotAnApproverException("${user.name} wrote this version; another approver decides it")
        if (user.role == COMPLIANCE_MANAGER && existing.assignee != user.name) {
            throw NotAnApproverException("${existing.rule.key} v${existing.rule.version} was sent to ${existing.assignee}, not to ${user.name}")
        }
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

    /** A version that changes an earlier one says why (ADR-0053); a first version and a preview do not. */
    private fun requireReason(rule: NewRule) {
        if (rule.changeReason.isNullOrBlank()) throw InvalidRuleException("say why the rule changes: changeReason is required")
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
