package cz.morosystems.aml.engine.triage

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

/**
 * A config that cannot be reasoned about has to fail when it is constructed, not at a decision. [TriageConfig]'s
 * `init` is the single gate for that, and it runs the same whether the value came from a request body or from rows,
 * so these tests construct configs directly and stay DB-free.
 *
 * [SEEDED_CONFIG] is the policy the migration seeds version 1 with, as a Kotlin value. It is the fixture the
 * repository test rounds the stored rows against.
 */
class TriageConfigTest {
    private val shipped = SEEDED_CONFIG

    @Test
    fun theSeededConfigCarriesTheVersionItWasBuiltUnder() {
        assertThat(shipped.configVersion).isEqualTo("triage-v1")
        assertThat(shipped.bands).isNotEmpty()
        assertThat(shipped.ruleTriage).isNotEmpty()
    }

    @Test
    fun theSeededConfigScoresEveryAutoCloseableRule() {
        // The old invariant — 'every whitelisted rule needs a base score' — is now structural: the flag and the score
        // are one row, so a rule cannot be marked closeable without being scored. This pins that they travel together.
        val closeable = shipped.ruleTriage.filterValues { it.autoCloseable }
        assertThat(closeable).isNotEmpty()
        assertThat(closeable.values.map { it.baseScore }).allMatch { it in 0..TriageConfig.MAX_SCORE }
    }

    @Test
    fun theSeededConfigScoresEveryPepImplyingRule() {
        val pepImplying = shipped.ruleTriage.filterValues { it.impliesPep }
        assertThat(pepImplying).isNotEmpty()
        assertThat(pepImplying.values.map { it.baseScore }).allMatch { it in 0..TriageConfig.MAX_SCORE }
    }

    @Test
    fun theSeededConfigCoversTheWholeScoreRangeInStrictlyIncreasingBands() {
        assertThat(shipped.bands.map { it.maxScore }).isSorted()
        assertThat(shipped.bands.last().maxScore).isGreaterThanOrEqualTo(TriageConfig.MAX_SCORE)
    }

    @Test
    fun theSeededConfigOrdersAmountBandsFromTheLargestThresholdDown() {
        assertThat(shipped.amountBands.zipWithNext().all { (a, b) -> a.from > b.from }).isTrue()
        shipped.intensityBands.forEach { (alertType, bands) ->
            assertThat(bands.zipWithNext().all { (a, b) -> a.fromHits > b.fromHits }).describedAs(alertType).isTrue()
        }
    }

    @Test
    fun theSeededConfigScoresAnUnbaselinedClient() {
        assertThat(shipped.factors.unbaselinedClient).isPositive()
    }

    @Test
    fun theSeededConfigHoldsAnUnbaselinedClientBackFromAnAutoClose() {
        val floor = shipped.floors.single { it.condition == FloorCondition.CLIENT_UNBASELINED }
        assertThat(floor.minDisposition).isGreaterThan(Disposition.AUTO_CLOSE)
    }

    @Test
    fun theSeededConfigLeavesTheHighRiskCountryListToBeInjectedAtRuntime() {
        assertThat(shipped.highRiskCountries).isEmpty()
    }

    @Test
    fun theSeededConfigLeavesTheAlertTypeNamesToBeInjectedAtRuntime() {
        assertThat(shipped.alertTypeNames).isEmpty()
    }

    @Test
    fun theSeededConfigLeavesTheRuleNamesToBeInjectedAtRuntime() {
        assertThat(shipped.ruleNames).isEmpty()
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
    fun scoresOutsideTheScoreRangeAreRejected() {
        assertThatThrownBy { valid().copy(unknownRuleScore = 101) }.isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { valid().copy(ruleTriage = mapOf("W1" to RuleTriage(-1, autoCloseable = true, impliesPep = true))) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("base score")
        assertThatThrownBy { valid().copy(ruleTriage = mapOf("W1" to RuleTriage(101, autoCloseable = false, impliesPep = false))) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("base score")
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
        ruleTriage = mapOf("W1" to RuleTriage(baseScore = 5, autoCloseable = true, impliesPep = true)),
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
        bands = listOf(Band(24, Disposition.AUTO_CLOSE), Band(100, Disposition.ESCALATE)),
        requiredFields = listOf(RequiredField.CLIENT_RISK),
        floors = listOf(Floor(FloorCondition.UNKNOWN_RULE, null, Disposition.ESCALATE)),
        highRiskCountries = setOf("IR"),
    )

    companion object {
        /** The six `triage_rule` rows the migration seeds. */
        val SEEDED_RULES: Map<String, RuleTriage> = mapOf(
            "A1" to RuleTriage(baseScore = 8, autoCloseable = true, impliesPep = false),
            "A2" to RuleTriage(baseScore = 8, autoCloseable = true, impliesPep = false),
            "A3" to RuleTriage(baseScore = 12, autoCloseable = true, impliesPep = false),
            "B1" to RuleTriage(baseScore = 40, autoCloseable = false, impliesPep = false),
            "B2" to RuleTriage(baseScore = 35, autoCloseable = false, impliesPep = true),
            "C1" to RuleTriage(baseScore = 45, autoCloseable = false, impliesPep = false),
        )

        /**
         * Version 1 of the policy as a value: the config the engine used to carry on its classpath, value for value.
         * The repository test asserts the seeded rows load back to exactly this.
         */
        val SEEDED_CONFIG = TriageConfig(
            configVersion = TriageConfigRepository.configVersion(1),
            ruleTriage = SEEDED_RULES,
            unknownRuleScore = 70,
            perExtraRule = 3,
            extraRuleMax = 6,
            factors = Factors(
                riskPoints = mapOf("low" to 0, "medium" to 10, "high" to 20),
                pep = 15,
                highRiskCountry = 10,
                staticCap = 25,
                channelPoints = mapOf("in person" to 0, "distant form" to 5),
                unbaselinedClient = 10,
                tenureUnder90Days = 10,
                tenureUnder365Days = 5,
                perExtraAlertType = 10,
                extraAlertTypeMax = 20,
            ),
            amountBands = listOf(AmountBand(1_000_000.0, 15), AmountBand(250_000.0, 8), AmountBand(50_000.0, 3)),
            intensityBands = mapOf(
                "A" to listOf(IntensityBand(60, 10), IntensityBand(45, 5)),
                "C" to listOf(IntensityBand(3, 10), IntensityBand(2, 5)),
            ),
            bands = listOf(
                Band(24, Disposition.AUTO_CLOSE),
                Band(44, Disposition.REVIEW_LOW),
                Band(64, Disposition.REVIEW_MEDIUM),
                Band(84, Disposition.REVIEW_HIGH),
                Band(100, Disposition.ESCALATE),
            ),
            requiredFields = listOf(
                RequiredField.CLIENT_RISK,
                RequiredField.CLIENT_COUNTRY,
                RequiredField.CLIENT_EXPECTED_VOLUME,
                RequiredField.ALERT_AMOUNT,
            ),
            floors = listOf(
                Floor(FloorCondition.UNKNOWN_RULE, null, Disposition.REVIEW_HIGH),
                Floor(FloorCondition.PEP_AND_HIGH_RISK_COUNTRY, null, Disposition.REVIEW_HIGH),
                Floor(FloorCondition.ALERT_TYPE, "B", Disposition.REVIEW_MEDIUM),
                Floor(FloorCondition.ALERT_TYPE, "C", Disposition.REVIEW_MEDIUM),
                Floor(FloorCondition.CLIENT_UNBASELINED, null, Disposition.REVIEW_LOW),
            ),
            highRiskCountries = emptySet(),
        )
    }
}
