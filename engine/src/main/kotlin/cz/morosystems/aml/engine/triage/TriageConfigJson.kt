package cz.morosystems.aml.engine.triage

import java.time.OffsetDateTime

/** One rule's triage policy, as `/api/triage` reads and writes it. */
data class RuleTriageJson(val ruleKey: String, val baseScore: Int, val autoCloseable: Boolean = false, val impliesPep: Boolean = false)

/** Points for an amount at or above [from] CZK. */
data class AmountBandJson(val from: Double, val points: Int)

/** Points for an alert carrying at least [fromHits] rule hits, under the alert type it is keyed by. */
data class IntensityBandJson(val fromHits: Int, val points: Int)

data class BandJson(val maxScore: Int, val disposition: String)

data class FloorJson(val condition: String, val alertType: String? = null, val minDisposition: String)

data class FactorsJson(
    val riskPoints: Map<String, Int>,
    val pep: Int,
    val highRiskCountry: Int,
    val staticCap: Int,
    val channelPoints: Map<String, Int>,
    val unbaselinedClient: Int,
    val tenureUnder90Days: Int,
    val tenureUnder365Days: Int,
    val perExtraAlertType: Int,
    val extraAlertTypeMax: Int,
)

/**
 * The rule-agnostic policy, typed rather than a free-form map: a malformed document is rejected by Jackson at the
 * boundary and an inconsistent one by [TriageConfig]'s init, so nothing unreadable ever reaches a row.
 *
 * `highRiskCountries` is accepted and echoed but never stored — the live list comes from `reference_list` at run time.
 */
data class TriageConfigPayloadJson(
    val unknownRuleScore: Int,
    val perExtraRule: Int,
    val extraRuleMax: Int,
    val factors: FactorsJson,
    val amountBands: List<AmountBandJson>,
    val intensityBands: Map<String, List<IntensityBandJson>>,
    val bands: List<BandJson>,
    val requiredFields: List<String>,
    val floors: List<FloorJson>,
    val highRiskCountries: List<String> = emptyList(),
)

/**
 * The POST body of `/api/triage/config`. It never carries a version — code assigns the next one — and [payload] is
 * the rule-agnostic policy object itself, not a string, so the caller sends and edits one document.
 */
data class TriageConfigBody(val author: String, val payload: TriageConfigPayloadJson, val rules: List<RuleTriageJson> = emptyList())

/**
 * The PATCH body of `/api/triage/config/rules/{ruleKey}`: one rule's whole triage policy.
 *
 * The config is insert-only, so applying this writes a *new* version and activates it; the version it was derived
 * from stays stored and stays readable.
 */
data class RuleScorePatchBody(val author: String, val baseScore: Int, val autoCloseable: Boolean = false, val impliesPep: Boolean = false)

/**
 * The PATCH body of `/api/triage/config/factors`: an author plus any subset of the eleven rule-agnostic numbers.
 * An omitted field is left as the active version has it — `null` means "leave it alone", not "set it to nothing".
 *
 * Like [RuleScorePatchBody], applying this creates a new version rather than editing one.
 */
data class FactorsPatchBody(
    val author: String,
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

data class TriageConfigVersionJson(
    val version: Int,
    val configVersion: String,
    val status: String,
    val author: String?,
    val createdAt: OffsetDateTime,
    val payload: TriageConfigPayloadJson,
    val rules: List<RuleTriageJson>,
)

data class CoverageJson(val unscored: List<String>, val orphaned: List<String>)

fun TriageConfigVersion.toJson() = TriageConfigVersionJson(
    version = version,
    configVersion = config.configVersion,
    status = status,
    author = author,
    createdAt = createdAt,
    payload = config.toPayloadJson(),
    rules = config.ruleTriage.map { (key, triage) -> RuleTriageJson(key, triage.baseScore, triage.autoCloseable, triage.impliesPep) }
        .sortedBy { it.ruleKey },
)

fun Coverage.toJson() = CoverageJson(unscored, orphaned)

fun FactorsPatchBody.toPatch() = FactorsPatch(
    unknownRuleScore = unknownRuleScore,
    perExtraRule = perExtraRule,
    extraRuleMax = extraRuleMax,
    pep = pep,
    highRiskCountry = highRiskCountry,
    staticCap = staticCap,
    unbaselinedClient = unbaselinedClient,
    tenureUnder90Days = tenureUnder90Days,
    tenureUnder365Days = tenureUnder365Days,
    perExtraAlertType = perExtraAlertType,
    extraAlertTypeMax = extraAlertTypeMax,
)

fun RuleScorePatchBody.toRuleTriage() = RuleTriage(baseScore, autoCloseable, impliesPep)

/**
 * Turns the body into the value a version is stored as. The [TriageConfig] is built here, which is where validation
 * happens: its `init` is the one gate, and it runs whether the config came from a request or from rows.
 *
 * @throws InvalidTriageConfigException when a rule key is blank or named twice, an enum name is unknown, or the
 *   config as a whole is internally inconsistent
 */
fun TriageConfigBody.toNewTriageConfig(): NewTriageConfig {
    val keys = rules.map { it.ruleKey.trim() }
    if (keys.any { it.isBlank() }) throw InvalidTriageConfigException("every rule score needs a rule key")
    keys.groupingBy { it }.eachCount().filterValues { it > 1 }.keys.firstOrNull()?.let {
        throw InvalidTriageConfigException("rule $it is scored twice")
    }
    val config = validated {
        TriageConfig(
            // A placeholder: the repository assigns the real version number, so the caller can never choose it.
            configVersion = TriageConfigRepository.configVersion(0),
            ruleTriage = rules.associate { it.ruleKey.trim() to RuleTriage(it.baseScore, it.autoCloseable, it.impliesPep) },
            unknownRuleScore = payload.unknownRuleScore,
            perExtraRule = payload.perExtraRule,
            extraRuleMax = payload.extraRuleMax,
            factors = Factors(
                riskPoints = payload.factors.riskPoints,
                pep = payload.factors.pep,
                highRiskCountry = payload.factors.highRiskCountry,
                staticCap = payload.factors.staticCap,
                channelPoints = payload.factors.channelPoints,
                unbaselinedClient = payload.factors.unbaselinedClient,
                tenureUnder90Days = payload.factors.tenureUnder90Days,
                tenureUnder365Days = payload.factors.tenureUnder365Days,
                perExtraAlertType = payload.factors.perExtraAlertType,
                extraAlertTypeMax = payload.factors.extraAlertTypeMax,
            ),
            amountBands = payload.amountBands.map { AmountBand(it.from, it.points) },
            intensityBands = payload.intensityBands.mapValues { (_, bands) -> bands.map { IntensityBand(it.fromHits, it.points) } },
            bands = payload.bands.map { Band(it.maxScore, dispositionOf(it.disposition)) },
            requiredFields = payload.requiredFields.map(RequiredField::of),
            floors = payload.floors.map { Floor(floorConditionOf(it.condition), it.alertType, dispositionOf(it.minDisposition)) },
            // Never stored: the live list is overlaid from `reference_list` at decision time.
            highRiskCountries = emptySet(),
        )
    }
    return NewTriageConfig(config = config, author = author.trim())
}

/**
 * The payload as the API shows it, rebuilt from the config a decision would be taken with rather than echoed from the
 * request: no unread key can travel along unnoticed.
 */
private fun TriageConfig.toPayloadJson() = TriageConfigPayloadJson(
    unknownRuleScore = unknownRuleScore,
    perExtraRule = perExtraRule,
    extraRuleMax = extraRuleMax,
    factors = FactorsJson(
        riskPoints = factors.riskPoints,
        pep = factors.pep,
        highRiskCountry = factors.highRiskCountry,
        staticCap = factors.staticCap,
        channelPoints = factors.channelPoints,
        unbaselinedClient = factors.unbaselinedClient,
        tenureUnder90Days = factors.tenureUnder90Days,
        tenureUnder365Days = factors.tenureUnder365Days,
        perExtraAlertType = factors.perExtraAlertType,
        extraAlertTypeMax = factors.extraAlertTypeMax,
    ),
    amountBands = amountBands.map { AmountBandJson(it.from, it.points) },
    intensityBands = intensityBands.mapValues { (_, bands) -> bands.map { IntensityBandJson(it.fromHits, it.points) } },
    bands = bands.map { BandJson(it.maxScore, it.disposition.name) },
    requiredFields = requiredFields.map { it.key },
    floors = floors.map { FloorJson(it.condition.name, it.alertType, it.minDisposition.name) },
    highRiskCountries = highRiskCountries.sorted(),
)

private fun dispositionOf(name: String): Disposition = enumOf("disposition", name)

private fun floorConditionOf(name: String): FloorCondition = enumOf("floor condition", name)

private inline fun <reified E : Enum<E>> enumOf(field: String, value: String): E =
    enumValues<E>().firstOrNull { it.name.equals(value.trim(), ignoreCase = true) }
        ?: throw InvalidTriageConfigException("unknown $field '$value'")
