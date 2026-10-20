package cz.morosystems.aml.engine.triage

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

class InvalidTriageConfigException(message: String) : RuntimeException(message)

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

/** Saves triage config versions as drafts, promotes one of them, and reports what the live one does not cover. */
@Service
class TriageConfigService(private val configs: TriageConfigRepository) {
    fun all(): List<TriageConfigVersion> = configs.allVersions()

    fun find(version: Int): TriageConfigVersion? = configs.find(version)

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
     * Rescores one rule: the active version is copied to the next one, that one row is written, and the copy is
     * activated — all in one transaction. The config is insert-only, so this is still a new immutable version and
     * the version it came from stays readable; what the caller sends is one field, not the whole document.
     *
     * [ruleKey] need not be scored by the active config — that is how a rule that falls to `unknownRuleScore` today
     * gets a score of its own.
     *
     * @throws InvalidTriageConfigException when the key or the author is blank, or the result would be invalid
     */
    @Transactional
    fun patchRuleScore(ruleKey: String, patch: RuleTriage, author: String): TriageConfigVersion {
        val key = ruleKey.trim()
        if (key.isBlank()) throw InvalidTriageConfigException("every rule score needs a rule key")
        val by = trimmedAuthor(author)
        val active = configs.active()

        validated { active.config.copy(ruleTriage = active.config.ruleTriage + (key to patch)) }
        val id = configs.copyAsDraft(active.version, by)
        configs.upsertRule(id, key, patch)
        return promote(id)
    }

    /**
     * Changes any subset of the rule-agnostic numbers, the same way [patchRuleScore] changes one rule: copy, write
     * the one parent row, activate, in one transaction.
     *
     * @throws InvalidTriageConfigException when the author is blank or the result would be invalid
     */
    @Transactional
    fun patchFactors(patch: FactorsPatch, author: String): TriageConfigVersion {
        val by = trimmedAuthor(author)
        val active = configs.active()

        validated { patch.applyTo(active.config) }
        val id = configs.copyAsDraft(active.version, by)
        configs.updateFactors(id, patch)
        return promote(id)
    }

    /**
     * Reads the draft back and activates it. Loading it is the point: [TriageConfig]'s init runs over what was
     * actually written, so a patch that would produce an invalid config throws and the whole transaction rolls
     * back — nothing half-applied, and the version that was active still is.
     */
    private fun promote(id: Long): TriageConfigVersion {
        val draft = validated { configs.allVersions().single { it.id == id } }
        configs.activate(draft.version)
        return configs.active()
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
