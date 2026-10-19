package cz.morosystems.aml.engine.triage

import java.time.LocalDate
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource

/**
 * Band edges, exactly. The config here scores nothing but prior reports, one point each, so a decision can be
 * dialled to any integer score and the band boundaries can be asserted on both sides.
 */
class TriageBandsTest {
    @ParameterizedTest(name = "score {0} is {1}")
    @MethodSource("edges")
    fun landsOnTheBandThatOwnsTheScore(score: Int, expected: Disposition) {
        val decision = Triage.decide(input(score), CONFIG)
        assertThat(decision.score).isEqualTo(score)
        assertThat(decision.disposition).isEqualTo(expected)
    }

    @Test
    fun everyBandIsEnteredAtItsOwnMaximumAndLeftOnePointLater() {
        CONFIG.bands.zipWithNext().forEach { (band, next) ->
            assertThat(Triage.decide(input(band.maxScore), CONFIG).disposition).describedAs("at ${band.maxScore}").isEqualTo(band.disposition)
            assertThat(Triage.decide(input(band.maxScore + 1), CONFIG).disposition).describedAs("at ${band.maxScore + 1}").isEqualTo(next.disposition)
        }
    }

    @Test
    fun aScoreAboveTheMaximumIsClampedAndSaysSo() {
        val decision = Triage.decide(input(150), CONFIG)
        assertThat(decision.score).isEqualTo(TriageConfig.MAX_SCORE)
        assertThat(decision.disposition).isEqualTo(Disposition.ESCALATE)
        assertThat(reasonOf(decision, "SCORE_CLAMPED").points).isEqualTo(-50)
        assertThat(decision.reasons.sumOf { it.points }).isEqualTo(decision.score)
    }

    @Test
    fun aNegativeScoreIsClampedToZeroAndSaysSo() {
        val negative = CONFIG.copy(factors = CONFIG.factors.copy(riskPoints = mapOf("low" to -20)))
        val decision = Triage.decide(input(0).copy(client = input(0).client.copy(risk = "low")), negative)
        assertThat(decision.score).isZero()
        assertThat(decision.disposition).isEqualTo(Disposition.AUTO_CLOSE)
        assertThat(reasonOf(decision, "SCORE_CLAMPED").points).isEqualTo(20)
        assertThat(decision.reasons.sumOf { it.points }).isEqualTo(decision.score)
    }

    @Test
    fun aScoreInsideTheRangeIsNotClamped() {
        assertThat(Triage.decide(input(50), CONFIG).reasons.map { it.code }).doesNotContain("SCORE_CLAMPED")
    }

    @Test
    fun theTopBandReachesTheMaximumScore() {
        assertThat(Triage.decide(input(TriageConfig.MAX_SCORE), CONFIG).disposition).isEqualTo(Disposition.ESCALATE)
    }

    private fun reasonOf(decision: TriageDecision, code: String): Reason =
        decision.reasons.firstOrNull { it.code == code } ?: error("no '$code' reason in ${decision.reasons.map { it.code }}")

    companion object {
        /** Scores nothing but prior reports (one point each) and floors nothing, so the score is dialled directly. */
        val CONFIG = TriageConfig(
            configVersion = "bands-test",
            baseScores = mapOf("Z0" to 0),
            unknownRuleScore = 0,
            perExtraRule = 0,
            extraRuleMax = 0,
            factors = Factors(
                riskPoints = emptyMap(),
                pep = 0,
                highRiskCountry = 0,
                staticCap = 0,
                channelPoints = emptyMap(),
                tenureUnder90Days = 0,
                tenureUnder365Days = 0,
                perExtraAlertType = 0,
                extraAlertTypeMax = 0,
                perPriorReport = 1,
                priorReportMax = 1_000,
            ),
            amountBands = emptyList(),
            intensityBands = emptyMap(),
            pepImpliedByRules = emptySet(),
            bands = listOf(
                Band(24, Disposition.AUTO_CLOSE),
                Band(44, Disposition.REVIEW_LOW),
                Band(64, Disposition.REVIEW_MEDIUM),
                Band(84, Disposition.REVIEW_HIGH),
                Band(100, Disposition.ESCALATE),
            ),
            autoCloseWhitelist = setOf("Z0"),
            requiredFields = emptyList(),
            floors = emptyList(),
            highRiskCountries = emptySet(),
            sanctionedCountries = emptySet(),
            sanctionedClients = emptySet(),
        )

        @JvmStatic
        fun edges(): List<Arguments> = listOf(
            Arguments.of(0, Disposition.AUTO_CLOSE),
            Arguments.of(24, Disposition.AUTO_CLOSE),
            Arguments.of(25, Disposition.REVIEW_LOW),
            Arguments.of(44, Disposition.REVIEW_LOW),
            Arguments.of(45, Disposition.REVIEW_MEDIUM),
            Arguments.of(64, Disposition.REVIEW_MEDIUM),
            Arguments.of(65, Disposition.REVIEW_HIGH),
            Arguments.of(84, Disposition.REVIEW_HIGH),
            Arguments.of(85, Disposition.ESCALATE),
            Arguments.of(100, Disposition.ESCALATE),
        )

        private fun input(score: Int) = TriageInput(
            alertId = 7,
            alertType = "A",
            clientId = "K1",
            transactionId = null,
            asOf = LocalDate.of(2026, 6, 30),
            hits = listOf(TriagedHit("Z0", 1, "G1", emptyMap())),
            client = ClientFacts("K1", null, null, null, null, null, null),
            counterpartyCountries = emptySet(),
            amountMinor = null,
            otherAlertTypesOnClient = emptySet(),
            priorReports = score,
        )
    }
}
