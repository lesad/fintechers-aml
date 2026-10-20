package cz.morosystems.aml.engine.triage

/** A score band. The first band whose [maxScore] the score does not exceed wins. */
data class Band(val maxScore: Int, val disposition: Disposition)

/** Points for an amount at or above [from] CZK. Bands are tried from the largest threshold down. */
data class AmountBand(val from: Double, val points: Int)

/**
 * Points for an alert carrying at least [fromHits] rule hits. Keyed per alert type because hit counts are not
 * comparable across them — a type A alert averages 43 hits, a type C alert 1.5, a type B alert exactly 1.
 */
data class IntensityBand(val fromHits: Int, val points: Int)

/** The conditions a hard floor may test. A closed set on purpose: a floor is a lookup, never an expression. */
enum class FloorCondition { UNKNOWN_RULE, PEP_AND_HIGH_RISK_COUNTRY, ALERT_TYPE, CLIENT_UNBASELINED }

/** A hard floor. It may only raise the disposition's severity, never lower it. */
data class Floor(val condition: FloorCondition, val alertType: String?, val minDisposition: Disposition)

/** The fields whose absence forces a review. A closed set, so a typo in the config fails at load, not at runtime. */
enum class RequiredField(val key: String) {
    CLIENT_RISK("client.risk"),
    CLIENT_COUNTRY("client.country"),
    CLIENT_EXPECTED_VOLUME("client.expected_monthly_volume"),
    ALERT_AMOUNT("alert.amount"),
    ;

    companion object {
        fun of(key: String): RequiredField =
            entries.firstOrNull { it.key == key } ?: error("unknown required field '$key', expected one of ${entries.map { it.key }}")
    }
}

/** Points per risk factor. Rating and channel are keyed by the lowercased literal the client table stores. */
data class Factors(
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
 * The triage policy for one rule key: what it scores on its own, whether an alert carrying only rules like it may be
 * closed without a reviewer, and whether the rule already requires PEP status (so the PEP factor is not charged twice).
 * Policy, not identity — the `rule` table says what a rule *is*, this says what triage does with it.
 */
data class RuleTriage(val baseScore: Int, val autoCloseable: Boolean, val impliesPep: Boolean)

/**
 * Everything the decision is tuned by, as data and under a version. Changing a number means a new stored version and a
 * new [configVersion] — decisions already taken stay explicable under the config they were taken with.
 */
data class TriageConfig(
    val configVersion: String,
    val ruleTriage: Map<String, RuleTriage>,
    val unknownRuleScore: Int,
    val perExtraRule: Int,
    val extraRuleMax: Int,
    val factors: Factors,
    val amountBands: List<AmountBand>,
    val intensityBands: Map<String, List<IntensityBand>>,
    val bands: List<Band>,
    val requiredFields: List<RequiredField>,
    val floors: List<Floor>,
    val highRiskCountries: Set<String>,
    /**
     * The reader-facing name of each alert type, by code, for the reason lines the review queue renders. Presentation
     * only — no score reads it — and like [highRiskCountries] it is overlaid at decision time, so a stored config
     * version carries it empty.
     */
    val alertTypeNames: Map<String, String> = emptyMap(),
    /**
     * The reader-facing name of each rule, by key, from the `rule` table's latest version of that key. Presentation
     * only, like [alertTypeNames]: a rule the table has no name for stays on its bare key.
     */
    val ruleNames: Map<String, String> = emptyMap(),
) {
    init {
        require(configVersion.isNotBlank()) { "configVersion must not be blank" }
        require(bands.isNotEmpty()) { "bands must not be empty" }
        require(bands.zipWithNext().all { (a, b) -> a.maxScore < b.maxScore }) { "band thresholds must strictly increase: ${bands.map { it.maxScore }}" }
        require(bands.last().maxScore >= MAX_SCORE) { "the last band must reach $MAX_SCORE, got ${bands.last().maxScore}" }
        require(unknownRuleScore in 0..MAX_SCORE) { "unknownRuleScore must be within 0..$MAX_SCORE" }
        require(ruleTriage.values.all { it.baseScore in 0..MAX_SCORE }) { "every base score must be within 0..$MAX_SCORE" }
        require(amountBands.zipWithNext().all { (a, b) -> a.from > b.from }) { "amount bands must be ordered by a strictly decreasing threshold" }
        require(amountBands.all { it.from >= 0 }) { "amount thresholds must not be negative" }
        require(intensityBands.values.all { bands -> bands.zipWithNext().all { (a, b) -> a.fromHits > b.fromHits } }) {
            "intensity bands must be ordered by a strictly decreasing hit count"
        }
        require(floors.all { (it.condition == FloorCondition.ALERT_TYPE) == (it.alertType != null) }) { "alertType is required exactly for an ALERT_TYPE floor" }
        require(factors.staticCap >= 0) { "staticCap must not be negative" }
    }

    companion object {
        const val MAX_SCORE = 100
    }
}
