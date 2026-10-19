package cz.morosystems.aml.engine.triage

import cz.morosystems.aml.engine.plain
import java.time.temporal.ChronoUnit

/**
 * The triage decision: deterministic, in code, no model. Six steps in a fixed order — base score, risk factors,
 * band, the auto-close gate, the missing-data floor, then the hard floors — and every one of them leaves a [Reason]
 * behind, so the score can be reconstructed from the explanation alone.
 *
 * Nothing here reads a clock, a connection or a random source; everything time-shaped arrives on [TriageInput].
 */
object Triage {
    fun decide(input: TriageInput, config: TriageConfig): TriageDecision {
        val reasons = mutableListOf<Reason>()
        val ruleKeys = input.hits.map { it.ruleKey }.distinct().sorted()
        val unknownRules = ruleKeys.filterNot { it in config.baseScores }

        base(input, config, ruleKeys, unknownRules, reasons)
        factors(input, config, ruleKeys, reasons)

        val raw = reasons.sumOf { it.points }
        val score = raw.coerceIn(0, TriageConfig.MAX_SCORE)
        if (score != raw) reasons += Reason("SCORE_CLAMPED", "the raw score $raw was clamped to 0..${TriageConfig.MAX_SCORE}", score - raw)

        var disposition = band(score, config)

        // Step 4: a score low enough to close only closes if the rules that fired are all allowed to be closed.
        if (disposition == Disposition.AUTO_CLOSE && !ruleKeys.all { it in config.autoCloseWhitelist }) {
            val blocking = ruleKeys.filterNot { it in config.autoCloseWhitelist }
            disposition = Disposition.REVIEW_LOW
            reasons += Reason(
                "AUTO_CLOSE_BLOCKED",
                "rule(s) ${prose(blocking.map { namedRule(it, config) })} are not on the auto-close whitelist",
                0,
            )
        }

        // Step 5: anything we were supposed to know and do not is reviewed by a person, whatever the score says.
        config.requiredFields.filter { missing(it, input) }.forEach { field ->
            disposition = maxOf(disposition, Disposition.REVIEW_MEDIUM)
            reasons += Reason("DATA_MISSING", "mandatory field '${field.key}' is absent", 0)
        }

        // Step 6: hard floors. maxOf, never assignment — a floor can only ever make the outcome stricter.
        config.floors.filter { matches(it, input, config, unknownRules) }.forEach { floor ->
            if (floor.minDisposition > disposition) {
                reasons += Reason("FLOOR_${floor.condition}", "floored to ${floor.minDisposition} (was $disposition)", 0)
            }
            disposition = maxOf(disposition, floor.minDisposition)
        }

        return TriageDecision(
            alertId = input.alertId,
            disposition = disposition,
            score = score,
            reasons = reasons.toList(),
            configVersion = config.configVersion,
            inputHash = CanonicalJson.sha256(input.canonicalForm()),
        )
    }

    /** Step 1. An unrecognised rule is never ignored: it takes the fail-safe score and can only raise the base. */
    private fun base(input: TriageInput, config: TriageConfig, ruleKeys: List<String>, unknownRules: List<String>, reasons: MutableList<Reason>) {
        val known = ruleKeys.mapNotNull { config.baseScores[it] }.maxOrNull() ?: 0
        when {
            input.hits.isEmpty() ->
                reasons += Reason("RULE_NONE", "the alert carries no rule hit; scored as unrecognised", config.unknownRuleScore)
            unknownRules.isNotEmpty() ->
                reasons += Reason(
                    "RULE_UNKNOWN",
                    "unrecognised rule(s) ${prose(unknownRules.map { namedRule(it, config) })}; fail-safe base score",
                    maxOf(config.unknownRuleScore, known),
                )
            else ->
                reasons += Reason("RULE_BASE", "base score for ${prose(ruleKeys.map { namedRule(it, config) })}", known)
        }
        if (ruleKeys.size > 1) {
            val extra = (config.perExtraRule * (ruleKeys.size - 1)).coerceAtMost(config.extraRuleMax)
            reasons += Reason("RULE_MULTIPLE", "${ruleKeys.size} distinct rules fired on one alert", extra)
        }
    }

    /** Step 2. A fixed order, and every factor leaves a line even when it scores nothing. */
    private fun factors(input: TriageInput, config: TriageConfig, ruleKeys: List<String>, reasons: MutableList<Reason>) {
        val f = config.factors

        val risk = input.client.risk?.lowercase()?.let { f.riskPoints[it] } ?: 0
        reasons += Reason("CLIENT_RISK", "client AML rating '${input.client.risk ?: "unknown"}'", risk)

        // A rule that already requires PEP status has priced it in; scoring it again counts one fact twice.
        val pepImplied = ruleKeys.isNotEmpty() && ruleKeys.all { it in config.pepImpliedByRules }
        val pep = if (input.client.pep == true && !pepImplied) f.pep else 0
        reasons += Reason(
            "CLIENT_PEP",
            when {
                input.client.pep != true -> "client is not a PEP"
                pepImplied -> "client is a PEP, already required by ${prose(ruleKeys.map { namedRule(it, config) })}"
                else -> "client is a PEP"
            },
            pep,
        )

        val countries = highRiskCountries(input, config)
        val country = if (countries.isEmpty()) 0 else f.highRiskCountry
        reasons += Reason(
            "COUNTRY_HIGH_RISK",
            if (countries.isEmpty()) "no party is in a high-risk country" else "high-risk country: ${countries.joinToString(", ")}",
            country,
        )

        val channel = input.client.channel?.lowercase()?.let { f.channelPoints[it] } ?: 0
        reasons += Reason("CLIENT_CHANNEL", "onboarded '${input.client.channel ?: "unknown"}'", channel)

        // Rating, residence and channel move together in this book: a foreign client is rated up and onboarded
        // remotely, so scoring all three in full charges one underlying fact three times. Cap their combined total.
        val static = risk + country + channel
        if (static > f.staticCap) {
            reasons += Reason("STATIC_CAP", "rating, country and channel capped at ${f.staticCap} (summed to $static)", f.staticCap - static)
        }

        val amount = input.amount?.let { value -> config.amountBands.firstOrNull { value >= it.from }?.points } ?: 0
        reasons += Reason("AMOUNT", input.amount?.let { "largest amount ${plain(it)} CZK" } ?: "no amount on this alert", amount)

        // Not a red flag in itself — an absence of evidence. It also blocks the auto-close, through its own floor.
        val unbaselined = if (input.client.unbaselined) f.unbaselinedClient else 0
        reasons += Reason(
            "CLIENT_UNBASELINED",
            if (input.client.unbaselined) "no usable baseline, zero or absent: ${input.client.missingBaseline.joinToString(", ")}"
            else "the client has a usable KYC and Q2 baseline",
            unbaselined,
        )

        // 'An A alert exists' says nothing — every client has one. How hard it fired is the only thing that separates them.
        val intensity = config.intensityBands[input.alertType]?.firstOrNull { input.hits.size >= it.fromHits }?.points ?: 0
        reasons += Reason("HIT_INTENSITY", "${input.hits.size} hit(s) on a type ${input.alertType} alert", intensity)

        val days = input.client.contractDate?.let { ChronoUnit.DAYS.between(it, input.asOf) }
        val tenure = when {
            days == null -> 0
            days < 90 -> f.tenureUnder90Days
            days < 365 -> f.tenureUnder365Days
            else -> 0
        }
        reasons += Reason("RELATIONSHIP_LENGTH", days?.let { "client for $it days" } ?: "contract date unknown", tenure)

        // One alert says the client broke one kind of rule; this says they broke another kind too, in the same run.
        val others = input.otherAlertTypesOnClient - input.alertType
        val multi = (f.perExtraAlertType * others.size).coerceAtMost(f.extraAlertTypeMax)
        reasons += Reason(
            "MULTIPLE_RULE_BREACHES",
            when (others.size) {
                0 -> "the client breaks no other kind of rule in this run"
                1 -> "the client also breaks another kind of rule in this run"
                else -> "the client also breaks ${others.size} other kinds of rule in this run"
            },
            multi,
        )
    }

    /** A rule as a reviewer reads it. Unnamed in the table — an unrecognised key especially — leaves the bare key. */
    private fun namedRule(ruleKey: String, config: TriageConfig): String =
        config.ruleNames[ruleKey]?.let { "$it ($ruleKey)" } ?: ruleKey

    /** 'a', 'a and b', 'a, b and c' — the reason lines are read, not parsed. */
    private fun prose(parts: List<String>): String =
        if (parts.size <= 1) parts.joinToString("") else "${parts.dropLast(1).joinToString(", ")} and ${parts.last()}"

    private fun band(score: Int, config: TriageConfig): Disposition =
        config.bands.first { score <= it.maxScore }.disposition

    private fun highRiskCountries(input: TriageInput, config: TriageConfig): List<String> =
        (listOfNotNull(input.client.country) + input.counterpartyCountries)
            .map { it.uppercase() }
            .filter { it in config.highRiskCountries }
            .distinct()
            .sorted()

    private fun missing(field: RequiredField, input: TriageInput): Boolean = when (field) {
        RequiredField.CLIENT_RISK -> input.client.risk.isNullOrBlank()
        RequiredField.CLIENT_COUNTRY -> input.client.country.isNullOrBlank()
        RequiredField.CLIENT_EXPECTED_VOLUME -> (input.client.expectedMonthlyVolume ?: 0.0) <= 0.0
        RequiredField.ALERT_AMOUNT -> input.amount == null
    }

    private fun matches(floor: Floor, input: TriageInput, config: TriageConfig, unknownRules: List<String>): Boolean =
        when (floor.condition) {
            FloorCondition.UNKNOWN_RULE -> unknownRules.isNotEmpty() || input.hits.isEmpty()
            FloorCondition.PEP_AND_HIGH_RISK_COUNTRY -> input.client.pep == true && highRiskCountries(input, config).isNotEmpty()
            FloorCondition.ALERT_TYPE -> input.alertType == floor.alertType
            FloorCondition.CLIENT_UNBASELINED -> input.client.unbaselined
        }
}
