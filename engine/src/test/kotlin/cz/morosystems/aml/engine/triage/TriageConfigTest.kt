package cz.morosystems.aml.engine.triage

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

/** The shipped config has to load, and a config that cannot be reasoned about has to fail at load, not at a decision. */
class TriageConfigTest {
    private val shipped = TriageConfig.load()

    @Test
    fun theShippedConfigLoadsFromTheClasspathUnderAVersion() {
        assertThat(shipped.configVersion).isNotBlank()
        assertThat(shipped.bands).isNotEmpty()
        assertThat(shipped.baseScores).isNotEmpty()
    }

    @Test
    fun theShippedConfigGivesEveryWhitelistedRuleABaseScore() {
        assertThat(shipped.autoCloseWhitelist).isNotEmpty()
        assertThat(shipped.baseScores.keys).containsAll(shipped.autoCloseWhitelist)
    }

    @Test
    fun theShippedConfigGivesEveryPepImplyingRuleABaseScore() {
        assertThat(shipped.pepImpliedByRules).isNotEmpty()
        assertThat(shipped.baseScores.keys).containsAll(shipped.pepImpliedByRules)
    }

    @Test
    fun theShippedConfigCoversTheWholeScoreRangeInStrictlyIncreasingBands() {
        assertThat(shipped.bands.map { it.maxScore }).isSorted()
        assertThat(shipped.bands.last().maxScore).isGreaterThanOrEqualTo(TriageConfig.MAX_SCORE)
    }

    @Test
    fun theShippedConfigOrdersAmountBandsFromTheLargestThresholdDown() {
        assertThat(shipped.amountBands.zipWithNext().all { (a, b) -> a.from > b.from }).isTrue()
        shipped.intensityBands.forEach { (alertType, bands) ->
            assertThat(bands.zipWithNext().all { (a, b) -> a.fromHits > b.fromHits }).describedAs(alertType).isTrue()
        }
    }

    @Test
    fun theShippedConfigScoresAnUnbaselinedClient() {
        assertThat(shipped.factors.unbaselinedClient).isPositive()
    }

    @Test
    fun theShippedConfigHoldsAnUnbaselinedClientBackFromAnAutoClose() {
        val floor = shipped.floors.single { it.condition == FloorCondition.CLIENT_UNBASELINED }
        assertThat(floor.minDisposition).isGreaterThan(Disposition.AUTO_CLOSE)
    }

    @Test
    fun theShippedConfigLeavesTheHighRiskCountryListToBeInjectedAtRuntime() {
        assertThat(shipped.highRiskCountries).isEmpty()
    }

    @Test
    fun theShippedConfigLeavesTheAlertTypeNamesToBeInjectedAtRuntime() {
        assertThat(shipped.alertTypeNames).isEmpty()
    }

    @Test
    fun theShippedConfigLeavesTheRuleNamesToBeInjectedAtRuntime() {
        assertThat(shipped.ruleNames).isEmpty()
    }

    @Test
    fun loadingAConfigThatIsNotOnTheClasspathFails() {
        assertThatThrownBy { TriageConfig.load("/triage/nope.json") }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun theBaselineUsedByTheRejectionTestsIsItselfValid() {
        assertThatCode { valid() }.doesNotThrowAnyException()
    }

    @Test
    fun aBlankConfigVersionIsRejected() {
        assertThatThrownBy { valid().copy(configVersion = " ") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("configVersion")
    }

    @Test
    fun bandThresholdsThatDoNotStrictlyIncreaseAreRejected() {
        val bands = listOf(Band(40, Disposition.AUTO_CLOSE), Band(40, Disposition.REVIEW_LOW), Band(100, Disposition.ESCALATE))
        assertThatThrownBy { valid().copy(bands = bands) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("strictly increase")
    }

    @Test
    fun aLastBandBelowTheMaximumScoreIsRejected() {
        val bands = listOf(Band(40, Disposition.AUTO_CLOSE), Band(99, Disposition.ESCALATE))
        assertThatThrownBy { valid().copy(bands = bands) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("last band")
    }

    @Test
    fun anEmptyBandListIsRejected() {
        assertThatThrownBy { valid().copy(bands = emptyList()) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("bands must not be empty")
    }

    @Test
    fun amountBandsThatDoNotStrictlyDecreaseAreRejected() {
        assertThatThrownBy { valid().copy(amountBands = listOf(AmountBand(100.0, 1), AmountBand(200.0, 2))) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("strictly decreasing")
        assertThatThrownBy { valid().copy(amountBands = listOf(AmountBand(200.0, 2), AmountBand(200.0, 1))) }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun intensityBandsThatDoNotStrictlyDecreaseAreRejected() {
        assertThatThrownBy { valid().copy(intensityBands = mapOf("A" to listOf(IntensityBand(2, 5), IntensityBand(4, 10)))) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("strictly decreasing hit count")
    }

    @Test
    fun anAlertTypeFloorWithoutAnAlertTypeIsRejected() {
        assertThatThrownBy { valid().copy(floors = listOf(Floor(FloorCondition.ALERT_TYPE, null, Disposition.REVIEW_MEDIUM))) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("alertType")
    }

    @Test
    fun aFloorThatIsNotAnAlertTypeFloorMayNotCarryAnAlertType() {
        assertThatThrownBy { valid().copy(floors = listOf(Floor(FloorCondition.UNKNOWN_RULE, "B", Disposition.ESCALATE))) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("alertType")
    }

    @Test
    fun aWhitelistedRuleWithoutABaseScoreIsRejected() {
        assertThatThrownBy { valid().copy(autoCloseWhitelist = setOf("NOPE")) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("NOPE")
    }

    @Test
    fun aPepImplyingRuleWithoutABaseScoreIsRejected() {
        assertThatThrownBy { valid().copy(pepImpliedByRules = setOf("NOPE")) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("NOPE")
    }

    @Test
    fun scoresOutsideTheScoreRangeAreRejected() {
        assertThatThrownBy { valid().copy(unknownRuleScore = 101) }.isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { valid().copy(baseScores = mapOf("W1" to -1)) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun aNegativeStaticCapIsRejected() {
        assertThatThrownBy { valid().copy(factors = valid().factors.copy(staticCap = -1)) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("staticCap")
    }

    @Test
    fun anUnknownRequiredFieldNameIsRejected() {
        assertThatThrownBy { RequiredField.of("client.favourite_colour") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("client.favourite_colour")
        assertThat(RequiredField.of("client.risk")).isEqualTo(RequiredField.CLIENT_RISK)
    }

    private fun valid() = TriageConfig(
        configVersion = "config-test",
        baseScores = mapOf("W1" to 5),
        unknownRuleScore = 70,
        perExtraRule = 3,
        extraRuleMax = 6,
        factors = Factors(
            riskPoints = mapOf("low" to 0),
            pep = 15,
            highRiskCountry = 10,
            staticCap = 25,
            channelPoints = mapOf("in person" to 0),
            unbaselinedClient = 0,
            tenureUnder90Days = 10,
            tenureUnder365Days = 5,
            perExtraAlertType = 10,
            extraAlertTypeMax = 20,
        ),
        amountBands = listOf(AmountBand(1_000_000.0, 15), AmountBand(250_000.0, 8)),
        intensityBands = mapOf("A" to listOf(IntensityBand(60, 10), IntensityBand(45, 5))),
        pepImpliedByRules = setOf("W1"),
        bands = listOf(Band(24, Disposition.AUTO_CLOSE), Band(100, Disposition.ESCALATE)),
        autoCloseWhitelist = setOf("W1"),
        requiredFields = listOf(RequiredField.CLIENT_RISK),
        floors = listOf(Floor(FloorCondition.UNKNOWN_RULE, null, Disposition.ESCALATE)),
        highRiskCountries = setOf("IR"),
    )
}
