package cz.morosystems.aml.engine.triage

import java.time.LocalDate
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource

/**
 * The golden table for the decision logic. The config is built in code on purpose: a tuning change to the shipped
 * JSON must be able to move thresholds without breaking the tests that pin the *logic*.
 */
class TriageTest {
    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    fun decidesTheCase(name: String, input: TriageInput, expected: Disposition) {
        assertThat(Triage.decide(input, CONFIG).disposition).describedAs(name).isEqualTo(expected)
    }

    @Test
    fun reasonsReconstructTheScore() {
        val decision = Triage.decide(
            input(risk = "high", country = "IR", channel = "distant form", hits = listOf(hit("M1"), hit("N1")), amountMinor = 30_000_000, priorReports = 1),
            CONFIG,
        )
        assertThat(decision.reasons.sumOf { it.points }).isEqualTo(decision.score)
    }

    @Test
    fun reasonsReconstructTheScoreWhenTheRawScoreWasClamped() {
        val decision = Triage.decide(input(hits = listOf(hit("BIG")), risk = "high", pep = true, country = "IR", priorReports = 2, amountMinor = 200_000_000), CONFIG)
        assertThat(decision.score).isEqualTo(100)
        assertThat(decision.reasons.sumOf { it.points }).isEqualTo(decision.score)
        assertThat(decision.reasons.map { it.code }).contains("SCORE_CLAMPED")
    }

    @Test
    fun everyFactorLeavesAReasonLineEvenWhenItScoresNothing() {
        val reasons = Triage.decide(input(), CONFIG).reasons.associateBy { it.code }
        val silent = listOf("CLIENT_RISK", "CLIENT_PEP", "COUNTRY_HIGH_RISK", "CLIENT_CHANNEL", "AMOUNT", "HIT_INTENSITY", "RELATIONSHIP_LENGTH", "MULTIPLE_FLAGS", "PRIOR_REPORTS")
        assertThat(reasons.keys).contains(*silent.toTypedArray())
        assertThat(silent.map { reasons.getValue(it).points }).containsOnly(0)
    }

    @Test
    fun anUnknownRuleTakesTheFailSafeScoreAndNamesTheRule() {
        val reason = reasonOf(Triage.decide(input(hits = listOf(hit("ZZ"))), CONFIG), "RULE_UNKNOWN")
        assertThat(reason.points).isEqualTo(CONFIG.unknownRuleScore)
        assertThat(reason.description).contains("ZZ")
    }

    @Test
    fun anUnknownRuleNeverScoresBelowAKnownRuleOnTheSameAlert() {
        val reason = reasonOf(Triage.decide(input(hits = listOf(hit("BIG"), hit("ZZ"))), CONFIG), "RULE_UNKNOWN")
        assertThat(reason.points).isEqualTo(80)
    }

    @Test
    fun anAlertWithNoHitIsScoredAsUnrecognised() {
        val reason = reasonOf(Triage.decide(input(hits = emptyList()), CONFIG), "RULE_NONE")
        assertThat(reason.points).isEqualTo(CONFIG.unknownRuleScore)
    }

    @Test
    fun blockingTheAutoCloseNamesTheRulesThatAreNotWhitelisted() {
        val decision = Triage.decide(input(hits = listOf(hit("N1"), hit("W1"))), CONFIG)
        assertThat(decision.disposition).isEqualTo(Disposition.REVIEW_LOW)
        assertThat(reasonOf(decision, "AUTO_CLOSE_BLOCKED").description).contains("N1").doesNotContain("W1")
    }

    @Test
    fun theStaticCapLimitsRatingCountryAndChannelToTheirCombinedCap() {
        val decision = Triage.decide(input(hits = listOf(hit("Z0")), risk = "high", country = "IR", channel = "distant form"), CONFIG)
        assertThat(reasonOf(decision, "STATIC_CAP").points).isEqualTo(-10)
        assertThat(decision.score).isEqualTo(CONFIG.factors.staticCap)
    }

    @Test
    fun theStaticCapLeavesAnUncappedCombinationAlone() {
        val decision = Triage.decide(input(hits = listOf(hit("Z0")), risk = "medium", channel = "distant form"), CONFIG)
        assertThat(decision.reasons.map { it.code }).doesNotContain("STATIC_CAP")
        assertThat(decision.score).isEqualTo(15)
    }

    @Test
    fun extraRulesScorePerRuleUpToTheirMaximum() {
        assertThat(reasonOf(Triage.decide(input(hits = listOf(hit("W1"), hit("W2"))), CONFIG), "RULE_MULTIPLE").points).isEqualTo(3)
        assertThat(reasonOf(Triage.decide(input(hits = listOf(hit("W1"), hit("W2"), hit("Z0"))), CONFIG), "RULE_MULTIPLE").points).isEqualTo(6)
        assertThat(reasonOf(Triage.decide(input(hits = listOf(hit("W1"), hit("W2"), hit("Z0"), hit("M1"))), CONFIG), "RULE_MULTIPLE").points).isEqualTo(CONFIG.extraRuleMax)
    }

    @Test
    fun repeatedHitsOfOneRuleAreNotExtraRules() {
        val decision = Triage.decide(input(hits = listOf(hit("W1", "G1"), hit("W1", "G2"), hit("W1", "G3"))), CONFIG)
        assertThat(decision.reasons.map { it.code }).doesNotContain("RULE_MULTIPLE")
    }

    @Test
    fun thePepFactorIsSuppressedWhenEveryRuleAlreadyRequiresPepStatus() {
        val implied = Triage.decide(input(hits = listOf(hit("P1")), pep = true), CONFIG)
        assertThat(reasonOf(implied, "CLIENT_PEP").points).isZero()
        assertThat(reasonOf(implied, "CLIENT_PEP").description).contains("already required by P1")

        val alsoAnotherRule = Triage.decide(input(hits = listOf(hit("P1"), hit("N1")), pep = true), CONFIG)
        assertThat(reasonOf(alsoAnotherRule, "CLIENT_PEP").points).isEqualTo(CONFIG.factors.pep)
    }

    @Test
    fun intensityBandsScorePerAlertType() {
        assertThat(intensityOf("A", 60)).isEqualTo(10)
        assertThat(intensityOf("A", 45)).isEqualTo(5)
        assertThat(intensityOf("A", 44)).isZero()
        assertThat(intensityOf("C", 3)).isEqualTo(10)
        assertThat(intensityOf("C", 2)).isEqualTo(5)
        assertThat(intensityOf("C", 1)).isZero()
        assertThat(intensityOf("D", 60)).describedAs("an alert type with no bands never scores on intensity").isZero()
    }

    @Test
    fun aFloorAnnouncesItselfOnlyWhenItActuallyRaisesTheDisposition() {
        val raised = Triage.decide(input(hits = listOf(hit("W1")), pep = true, country = "IR"), CONFIG)
        assertThat(raised.reasons.map { it.code }).contains("FLOOR_PEP_AND_HIGH_RISK_COUNTRY")

        val alreadyStricter = Triage.decide(input(alertType = "B", hits = listOf(hit("BIG")), risk = "high"), CONFIG)
        assertThat(alreadyStricter.reasons.map { it.code }).doesNotContain("FLOOR_ALERT_TYPE")
    }

    @Test
    fun theDecisionCarriesTheConfigVersionAndTheAlertItWasTakenFor() {
        val decision = Triage.decide(input(), CONFIG)
        assertThat(decision.configVersion).isEqualTo(CONFIG.configVersion)
        assertThat(decision.alertId).isEqualTo(1L)
        assertThat(decision.inputHash).hasSize(64)
    }

    private fun reasonOf(decision: TriageDecision, code: String): Reason =
        decision.reasons.firstOrNull { it.code == code } ?: error("no '$code' reason in ${decision.reasons.map { it.code }}")

    private fun intensityOf(alertType: String, hits: Int): Int =
        reasonOf(Triage.decide(input(alertType = alertType, hits = (1..hits).map { hit("M1", "G$it") }), CONFIG), "HIT_INTENSITY").points

    companion object {
        private val ASOF: LocalDate = LocalDate.of(2026, 6, 30)

        /** A fixed config, deliberately independent of the shipped JSON. */
        val CONFIG = TriageConfig(
            configVersion = "triage-test",
            baseScores = mapOf("Z0" to 0, "W1" to 5, "W2" to 5, "N1" to 10, "M1" to 20, "P1" to 30, "BIG" to 80),
            unknownRuleScore = 70,
            perExtraRule = 3,
            extraRuleMax = 6,
            factors = Factors(
                riskPoints = mapOf("low" to 0, "medium" to 10, "high" to 20),
                pep = 15,
                highRiskCountry = 10,
                staticCap = 25,
                channelPoints = mapOf("in person" to 0, "distant form" to 5),
                tenureUnder90Days = 10,
                tenureUnder365Days = 5,
                perExtraAlertType = 10,
                extraAlertTypeMax = 20,
                perPriorReport = 10,
                priorReportMax = 20,
            ),
            amountBands = listOf(AmountBand(100_000_000, 15), AmountBand(25_000_000, 8), AmountBand(5_000_000, 3)),
            intensityBands = mapOf(
                "A" to listOf(IntensityBand(60, 10), IntensityBand(45, 5)),
                "C" to listOf(IntensityBand(3, 10), IntensityBand(2, 5)),
            ),
            pepImpliedByRules = setOf("P1"),
            bands = listOf(
                Band(24, Disposition.AUTO_CLOSE),
                Band(44, Disposition.REVIEW_LOW),
                Band(64, Disposition.REVIEW_MEDIUM),
                Band(84, Disposition.REVIEW_HIGH),
                Band(100, Disposition.ESCALATE),
            ),
            autoCloseWhitelist = setOf("Z0", "W1", "W2", "M1"),
            requiredFields = listOf(RequiredField.CLIENT_RISK, RequiredField.CLIENT_COUNTRY, RequiredField.ALERT_AMOUNT),
            floors = listOf(
                Floor(FloorCondition.SANCTIONS_MATCH, null, Disposition.ESCALATE),
                Floor(FloorCondition.UNKNOWN_RULE, null, Disposition.REVIEW_HIGH),
                Floor(FloorCondition.PEP_AND_HIGH_RISK_COUNTRY, null, Disposition.REVIEW_HIGH),
                Floor(FloorCondition.ALERT_TYPE, "B", Disposition.REVIEW_MEDIUM),
            ),
            highRiskCountries = setOf("IR", "SY"),
            sanctionedCountries = setOf("KP"),
            sanctionedClients = setOf("SANCTIONED"),
        )

        @JvmStatic
        fun cases(): List<Arguments> = listOf(
            case("a whitelisted low-scoring rule closes itself", input(hits = listOf(hit("W1"))), Disposition.AUTO_CLOSE),
            case("the same alert on a rule that may not auto-close lands on REVIEW_LOW", input(hits = listOf(hit("N1"))), Disposition.REVIEW_LOW),
            case("an unrecognised rule takes the fail-safe score and its floor", input(hits = listOf(hit("ZZ"))), Disposition.REVIEW_HIGH),
            case("an alert with no hit at all is treated as unrecognised", input(hits = emptyList()), Disposition.REVIEW_HIGH),
            case("a missing mandatory field forces a review at score zero", input(hits = listOf(hit("Z0")), risk = null), Disposition.REVIEW_MEDIUM),
            case("a blank mandatory field counts as missing", input(hits = listOf(hit("Z0")), country = " "), Disposition.REVIEW_MEDIUM),
            case("a sanctioned client escalates at score zero", input(hits = listOf(hit("Z0")), clientId = "SANCTIONED"), Disposition.ESCALATE),
            case("a sanctioned counterparty country escalates at score zero", input(hits = listOf(hit("Z0")), counterpartyCountries = setOf("kp")), Disposition.ESCALATE),
            case("an ALERT_TYPE floor never softens an escalation", input(alertType = "B", hits = listOf(hit("BIG")), risk = "high"), Disposition.ESCALATE),
            case("an ALERT_TYPE floor does lift a quiet alert of that type", input(alertType = "B", hits = listOf(hit("Z0"))), Disposition.REVIEW_MEDIUM),
            case("a PEP in a high-risk country is reviewed at least highly", input(hits = listOf(hit("W1")), pep = true, country = "IR"), Disposition.REVIEW_HIGH),
            case("a PEP whose only rule already requires PEP status is not charged twice", input(hits = listOf(hit("P1")), pep = true), Disposition.REVIEW_LOW),
            case("the same PEP alongside another rule does score the PEP factor", input(hits = listOf(hit("P1"), hit("N1")), pep = true), Disposition.REVIEW_MEDIUM),
            case("rating, country and channel together stay inside the static cap", input(hits = listOf(hit("Z0")), risk = "high", country = "IR", channel = "distant form"), Disposition.REVIEW_LOW),
            case("one rule alone stays closeable", input(hits = listOf(hit("M1"))), Disposition.AUTO_CLOSE),
            case("several distinct rules add up past the band edge", input(hits = listOf(hit("M1"), hit("N1"), hit("W1"))), Disposition.REVIEW_LOW),
            case("intensity lifts a type C alert that fired three times", input(alertType = "C", hits = listOf(hit("M1", "G1"), hit("M1", "G2"), hit("M1", "G3"))), Disposition.REVIEW_LOW),
            case("the same three hits on a type with no intensity band do not", input(alertType = "D", hits = listOf(hit("M1", "G1"), hit("M1", "G2"), hit("M1", "G3"))), Disposition.AUTO_CLOSE),
            case("a large amount lifts an otherwise quiet alert", input(hits = listOf(hit("M1")), amountMinor = 100_000_000), Disposition.REVIEW_LOW),
            case("other alert types on the same client add up", input(hits = listOf(hit("M1")), otherAlertTypesOnClient = setOf("B", "C")), Disposition.REVIEW_LOW),
            case("a brand new relationship scores on tenure", input(hits = listOf(hit("M1")), contractDate = ASOF.minusDays(10)), Disposition.REVIEW_LOW),
        )

        private fun case(name: String, input: TriageInput, expected: Disposition) = Arguments.of(name, input, expected)

        private fun hit(rule: String, grainKey: String = "G1") = TriagedHit(rule, 1, grainKey, mapOf("amount" to 1_000_000L))

        private fun input(
            alertType: String = "A",
            hits: List<TriagedHit> = listOf(hit("W1")),
            clientId: String = "K1",
            risk: String? = "low",
            pep: Boolean? = false,
            country: String? = "CZ",
            channel: String? = "in person",
            contractDate: LocalDate? = LocalDate.of(2020, 1, 1),
            type: String? = "individual",
            counterpartyCountries: Set<String> = emptySet(),
            amountMinor: Long? = 1_000_000,
            otherAlertTypesOnClient: Set<String> = emptySet(),
            priorReports: Int = 0,
        ) = TriageInput(
            alertId = 1,
            alertType = alertType,
            clientId = clientId,
            transactionId = "T1",
            asOf = ASOF,
            hits = hits,
            client = ClientFacts(clientId, risk, pep, country, channel, contractDate, type),
            counterpartyCountries = counterpartyCountries,
            amountMinor = amountMinor,
            otherAlertTypesOnClient = otherAlertTypesOnClient,
            priorReports = priorReports,
        )
    }
}
