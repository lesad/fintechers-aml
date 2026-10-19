package cz.morosystems.aml.engine.triage

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

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
 * Everything the decision is tuned by, as data and under a version. Changing a number means a new file and a new
 * [configVersion] — decisions already taken stay explicable under the config they were taken with.
 */
data class TriageConfig(
    val configVersion: String,
    val baseScores: Map<String, Int>,
    val unknownRuleScore: Int,
    val perExtraRule: Int,
    val extraRuleMax: Int,
    val factors: Factors,
    val amountBands: List<AmountBand>,
    val intensityBands: Map<String, List<IntensityBand>>,
    val pepImpliedByRules: Set<String>,
    val bands: List<Band>,
    val autoCloseWhitelist: Set<String>,
    val requiredFields: List<RequiredField>,
    val floors: List<Floor>,
    val highRiskCountries: Set<String>,
    /**
     * The reader-facing name of each alert type, by code, for the reason lines the review queue renders. Presentation
     * only — no score reads it — and like [highRiskCountries] it comes from the database, so the file ships it empty.
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
        require(baseScores.values.all { it in 0..MAX_SCORE }) { "every base score must be within 0..$MAX_SCORE" }
        require(amountBands.zipWithNext().all { (a, b) -> a.from > b.from }) { "amount bands must be ordered by a strictly decreasing threshold" }
        require(amountBands.all { it.from >= 0 }) { "amount thresholds must not be negative" }
        require(intensityBands.values.all { bands -> bands.zipWithNext().all { (a, b) -> a.fromHits > b.fromHits } }) {
            "intensity bands must be ordered by a strictly decreasing hit count"
        }
        require(pepImpliedByRules.all { it in baseScores }) { "every PEP-implying rule needs a base score: ${pepImpliedByRules - baseScores.keys}" }
        require(autoCloseWhitelist.all { it in baseScores }) { "every whitelisted rule needs a base score: ${autoCloseWhitelist - baseScores.keys}" }
        require(floors.all { (it.condition == FloorCondition.ALERT_TYPE) == (it.alertType != null) }) { "alertType is required exactly for an ALERT_TYPE floor" }
        require(factors.staticCap >= 0) { "staticCap must not be negative" }
    }

    companion object {
        const val MAX_SCORE = 100
        const val RESOURCE = "/triage/triage-config-v1.json"

        private val mapper = JsonMapper()

        /** Loads a config from the classpath. Throws on anything malformed — a bad config must not reach a decision. */
        fun load(resource: String = RESOURCE): TriageConfig {
            val stream = TriageConfig::class.java.getResourceAsStream(resource) ?: error("triage config not found on the classpath: $resource")
            return stream.use { parse(it.readBytes().toString(Charsets.UTF_8)) }
        }

        fun parse(json: String): TriageConfig {
            val root = mapper.readTree(json)
            val factors = root.required("factors")
            return TriageConfig(
                configVersion = root.required("configVersion").stringValue(),
                baseScores = root.required("baseScores").intMap(),
                unknownRuleScore = root.required("unknownRuleScore").intValue(),
                perExtraRule = root.required("perExtraRule").intValue(),
                extraRuleMax = root.required("extraRuleMax").intValue(),
                factors = Factors(
                    riskPoints = factors.required("riskPoints").intMap().mapKeys { it.key.lowercase() },
                    pep = factors.required("pep").intValue(),
                    highRiskCountry = factors.required("highRiskCountry").intValue(),
                    staticCap = factors.required("staticCap").intValue(),
                    channelPoints = factors.required("channelPoints").intMap().mapKeys { it.key.lowercase() },
                    unbaselinedClient = factors.required("unbaselinedClient").intValue(),
                    tenureUnder90Days = factors.required("tenureUnder90Days").intValue(),
                    tenureUnder365Days = factors.required("tenureUnder365Days").intValue(),
                    perExtraAlertType = factors.required("perExtraAlertType").intValue(),
                    extraAlertTypeMax = factors.required("extraAlertTypeMax").intValue(),
                ),
                amountBands = root.required("amountBands").values().map { AmountBand(it.required("from").doubleValue(), it.required("points").intValue()) },
                intensityBands = root.required("intensityBands").properties().associate { (alertType, node) ->
                    alertType to node.values().map { IntensityBand(it.required("fromHits").intValue(), it.required("points").intValue()) }
                },
                pepImpliedByRules = root.required("pepImpliedByRules").values().map { it.stringValue() }.toSet(),
                bands = root.required("bands").values().map { Band(it.required("maxScore").intValue(), disposition(it.required("disposition").stringValue())) },
                autoCloseWhitelist = root.required("autoCloseWhitelist").values().map { it.stringValue() }.toSet(),
                requiredFields = root.required("requiredFields").values().map { RequiredField.of(it.stringValue()) },
                floors = root.required("floors").values().map {
                    Floor(
                        condition = enumValueOf<FloorCondition>(it.required("condition").stringValue()),
                        alertType = it.get("alertType")?.takeUnless { node -> node.isNull }?.stringValue(),
                        minDisposition = disposition(it.required("minDisposition").stringValue()),
                    )
                },
                highRiskCountries = root.required("highRiskCountries").values().map { it.stringValue().uppercase() }.toSet(),
            )
        }

        private fun disposition(name: String) = enumValueOf<Disposition>(name)

        private fun JsonNode.required(field: String): JsonNode = get(field) ?: error("triage config is missing '$field'")

        private fun JsonNode.intMap(): Map<String, Int> = properties().associate { (key, node) -> key to node.intValue() }
    }
}
