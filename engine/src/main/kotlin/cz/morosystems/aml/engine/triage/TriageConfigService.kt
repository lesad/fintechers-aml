package cz.morosystems.aml.engine.triage

import cz.morosystems.aml.engine.user.APPROVER_ROLES
import cz.morosystems.aml.engine.user.AppUser
import cz.morosystems.aml.engine.user.COMPLIANCE_MANAGER
import cz.morosystems.aml.engine.user.COMPLIANCE_OFFICER
import cz.morosystems.aml.engine.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

class InvalidTriageConfigException(message: String) : RuntimeException(message)

class NotAnApproverException(message: String) : RuntimeException(message)

/**
 * Which rule keys the active config and the live rules disagree about.
 *
 * @param unscored live rules the active config has no score for — they fall to `unknownRuleScore` and the
 *   `UNKNOWN_RULE` floor, which is a working fail-safe but not a policy anyone chose.
 * @param orphaned scored keys no live rule uses any more; harmless, but they are dead policy.
 */
data class Coverage(val unscored: List<String>, val orphaned: List<String>)

/**
 * A change to the rule-agnostic numbers, one field at a time. Every field is nullable and `null` means "leave it as
 * the version being derived from has it" — the caller sends what it edited and nothing else.
 */
data class FactorsPatch(
    val unknownRuleScore: Int? = null,
    val perExtraRule: Int? = null,
    val extraRuleMax: Int? = null,
    val pep: Int? = null,
    val highRiskCountry: Int? = null,
    val staticCap: Int? = null,
    val unbaselinedClient: Int? = null,
    val tenureUnder90Days: Int? = null,
    val tenureUnder365Days: Int? = null,
    val perExtraAlertType: Int? = null,
    val extraAlertTypeMax: Int? = null,
)

/**
 * A change proposed against the active config: the whole policy of each rule it rescores, plus any subset of the
 * rule-agnostic numbers. Everything it does not name is left as the version it is derived from has it.
 */
data class TriageChanges(val rules: Map<String, RuleTriage> = emptyMap(), val factors: FactorsPatch = FactorsPatch()) {
    val isEmpty: Boolean get() = rules.isEmpty() && factors == FactorsPatch()
}

/**
 * Saves triage config versions as drafts, takes a draft through a compliance officer's approval, and reports what the
 * live one does not cover.
 */
@Service
class TriageConfigService(private val configs: TriageConfigRepository, private val users: UserRepository) {
    fun all(): List<TriageConfigVersion> = configs.allVersions()

    fun find(version: Int): TriageConfigVersion? = configs.find(version)

    /** The version still being decided — one at a time, so a proposal has a single identity. */
    fun open(): TriageConfigVersion? = configs.open().firstOrNull()

    /**
     * Stores [draft] as the next draft version. The config it carries was already validated where it was built — a
     * [TriageConfig] cannot exist in an inconsistent state — so nothing here can leave a partial row behind.
     *
     * @throws InvalidTriageConfigException when the draft has no author
     */
    fun save(draft: NewTriageConfig): TriageConfigVersion {
        if (draft.author.isBlank()) throw InvalidTriageConfigException("a triage config needs an author")
        val id = configs.insertDraft(draft)
        return configs.allVersions().single { it.id == id }
    }

    /** Promotes [version] and retires the current active one. */
    fun activate(version: Int): TriageConfigVersion {
        configs.find(version) ?: throw InvalidTriageConfigException("triage config version $version not found")
        configs.activate(version)
        return configs.active()
    }

    fun coverage(): Coverage {
        val scored = configs.active().config.ruleTriage.keys
        val live = configs.liveRuleKeys()
        return Coverage(unscored = (live - scored).sorted(), orphaned = (scored - live).sorted())
    }

    /**
     * Proposes [changes] as a draft, without touching what triage runs under (ADR-0056). The open draft is written if
     * there is one — so a second save stacks onto the same proposal rather than burning a version per field — else the
     * active version is copied into the next one in SQL and the changes are written on the copy.
     *
     * A rescored key need not be scored by the active config: that is how a rule falling to `unknownRuleScore` today
     * gets a score of its own.
     *
     * @throws InvalidTriageConfigException when the author is blank, a rule key is blank, nothing is changed, the
     *   result would be invalid, or a version is already waiting for its approver
     */
    @Transactional
    fun propose(changes: TriageChanges, author: String): TriageConfigVersion {
        val by = trimmedAuthor(author)
        if (changes.isEmpty) throw InvalidTriageConfigException("a proposal changes at least one score or factor")
        if (changes.rules.keys.any { it.isBlank() }) throw InvalidTriageConfigException("every rule score needs a rule key")

        val open = open()
        if (open?.status == "pending") {
            throw InvalidTriageConfigException(
                "version ${open.version} is waiting for ${open.assignee ?: "an approver"}; it is decided before another change is proposed",
            )
        }

        val from = open ?: configs.active()
        validated { changes.applyTo(from.config) }
        val id = open?.id ?: configs.copyAsDraft(configs.active().version, by)
        changes.rules.forEach { (key, triage) -> configs.upsertRule(id, key.trim(), triage) }
        configs.updateFactors(id, changes.factors)

        // Loading it back is the point: `TriageConfig`'s init runs over what was actually written, so a change that
        // would produce an invalid config throws and the whole transaction rolls back — nothing half-applied.
        return validated { configs.allVersions().single { it.id == id } }
    }

    /**
     * Sends the draft [version] for approval to [approverId] (four eyes, ADR-0052): a compliance officer or compliance
     * manager who neither wrote it nor is [sender]; without one, the first compliance officer who is neither. It turns
     * `pending` and can no longer be edited.
     *
     * @return null when there is no such version
     * @throws InvalidTriageConfigException when [version] is not a draft, or the approver is missing, too junior, its
     *   author or the sender
     */
    fun submit(version: Int, approverId: Long? = null, sender: AppUser? = null): TriageConfigVersion? {
        val existing = configs.find(version) ?: return null
        val excluded = setOfNotNull(existing.author, sender?.name)
        val approver = if (approverId == null) {
            users.all().firstOrNull { it.role == COMPLIANCE_OFFICER && it.name !in excluded }
        } else {
            users.find(approverId)
        }
        if (approver == null || approver.role !in APPROVER_ROLES || approver.name in excluded) {
            throw InvalidTriageConfigException(
                "triage config v$version needs an approver: a compliance officer or compliance manager who neither wrote nor sends it",
            )
        }
        return transition(version, "draft", "sent for approval") { configs.submit(it, approver.id) }
    }

    /**
     * Activates the pending [version] and retires the one that was active. The next run decides under it; nothing is
     * re-triaged.
     *
     * @return null when there is no such version
     * @throws NotAnApproverException when [user] may not decide it, see [checkApprover]
     * @throws InvalidTriageConfigException when [version] is not pending
     */
    fun approve(version: Int, user: AppUser): TriageConfigVersion? {
        checkApprover(version, user, "approve")
        return transition(version, "pending", "approved") { configs.approve(it, user.name) }
    }

    /**
     * Sends the pending [version] back to `draft`, so it can be edited and sent again.
     *
     * @return null when there is no such version
     * @throws NotAnApproverException when [user] may not decide it, see [checkApprover]
     * @throws InvalidTriageConfigException when [version] is not pending
     */
    fun reject(version: Int, user: AppUser): TriageConfigVersion? {
        checkApprover(version, user, "reject")
        return transition(version, "pending", "rejected", configs::reject)
    }

    /**
     * Deletes the draft [version]. A version sent for approval or already decided stays, for audit.
     *
     * @return false when there is no such version
     * @throws InvalidTriageConfigException when [version] is not a draft
     */
    fun delete(version: Int): Boolean {
        val existing = configs.find(version) ?: return false
        if (!configs.deleteDraft(version)) {
            throw InvalidTriageConfigException("only a draft can be deleted; triage config v$version is ${existing.status}")
        }
        return true
    }

    /**
     * Four eyes: a compliance officer decides any version they did not write; a compliance manager only the one sent
     * to them; nobody decides their own.
     */
    private fun checkApprover(version: Int, user: AppUser, verb: String) {
        val existing = configs.find(version) ?: return
        if (user.role !in APPROVER_ROLES) throw NotAnApproverException("only a compliance officer or compliance manager can $verb a triage config")
        if (existing.author == user.name) throw NotAnApproverException("${user.name} wrote this version; another approver decides it")
        if (user.role == COMPLIANCE_MANAGER && existing.assignee != user.name) {
            throw NotAnApproverException("triage config v$version was sent to ${existing.assignee}, not to ${user.name}")
        }
    }

    private fun transition(version: Int, from: String, verb: String, change: (Int) -> Boolean): TriageConfigVersion? {
        val existing = configs.find(version) ?: return null
        if (!change(version)) throw InvalidTriageConfigException("only a $from version can be $verb; triage config v$version is ${existing.status}")
        return configs.find(version)
    }

    private fun trimmedAuthor(author: String): String =
        author.trim().ifBlank { throw InvalidTriageConfigException("a triage config needs an author") }
}

/**
 * Runs [build] behind the one validation gate there is — [TriageConfig]'s own `init` — and re-throws whatever it
 * complains about verbatim, so the caller sees the real reason rather than a generic failure.
 */
internal fun <T> validated(build: () -> T): T = try {
    build()
} catch (e: IllegalArgumentException) {
    throw InvalidTriageConfigException(e.message ?: "the triage config could not be read")
} catch (e: IllegalStateException) {
    throw InvalidTriageConfigException(e.message ?: "the triage config could not be read")
}

/** The changed config as a value, so its `init` can reject the proposal before a single row is written. */
internal fun TriageChanges.applyTo(config: TriageConfig): TriageConfig =
    factors.applyTo(config.copy(ruleTriage = config.ruleTriage + rules.mapKeys { it.key.trim() }))

/** The patched config as a value, so its `init` can reject the change before a single row is written. */
internal fun FactorsPatch.applyTo(config: TriageConfig): TriageConfig = config.copy(
    unknownRuleScore = unknownRuleScore ?: config.unknownRuleScore,
    perExtraRule = perExtraRule ?: config.perExtraRule,
    extraRuleMax = extraRuleMax ?: config.extraRuleMax,
    factors = config.factors.copy(
        pep = pep ?: config.factors.pep,
        highRiskCountry = highRiskCountry ?: config.factors.highRiskCountry,
        staticCap = staticCap ?: config.factors.staticCap,
        unbaselinedClient = unbaselinedClient ?: config.factors.unbaselinedClient,
        tenureUnder90Days = tenureUnder90Days ?: config.factors.tenureUnder90Days,
        tenureUnder365Days = tenureUnder365Days ?: config.factors.tenureUnder365Days,
        perExtraAlertType = perExtraAlertType ?: config.factors.perExtraAlertType,
        extraAlertTypeMax = extraAlertTypeMax ?: config.factors.extraAlertTypeMax,
    ),
)
