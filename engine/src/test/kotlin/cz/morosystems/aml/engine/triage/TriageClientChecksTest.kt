package cz.morosystems.aml.engine.triage

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * The client-profile half of the decision: whether the client can be profiled at all (baseline), and what happens
 * when the declared volume that baseline rests on is simply absent.
 *
 * The config is built on [TriageTest.CONFIG] and switched on one factor at a time, so each assertion is about the
 * factor it names and nothing else. Amounts are CZK doubles; the scoring itself is whole-number arithmetic.
 */
class TriageClientChecksTest {
    private val base = TriageTest.CONFIG

    // ---- CLIENT_UNBASELINED ------------------------------------------------------------------------------------

    private val baselineScored = base.copy(factors = base.factors.copy(unbaselinedClient = 10))

    @Test
    fun aClientMissingAnyBaselineFieldIsUnbaselinedAndScoresTheFactor() {
        val missing = mapOf(
            "expected_monthly_volume" to TriageTest.input(expectedMonthlyVolume = 0.0),
            "q2_volume" to TriageTest.input(q2Volume = 0.0),
            "q2_tx_count" to TriageTest.input(q2TxCount = 0),
            "q2_days" to TriageTest.input(q2Days = 0),
        )
        missing.forEach { (field, input) ->
            assertThat(input.client.unbaselined).describedAs(field).isTrue()
            assertThat(input.client.missingBaseline).describedAs(field).containsExactly(field)
            val reason = reasonOf(Triage.decide(input, baselineScored), "CLIENT_UNBASELINED")
            assertThat(reason.points).describedAs(field).isEqualTo(baselineScored.factors.unbaselinedClient)
            assertThat(reason.description).describedAs(field).contains(field)
        }
    }

    @Test
    fun aNullBaselineFieldCountsTheSameAsAZeroOne() {
        listOf(
            TriageTest.input(expectedMonthlyVolume = null),
            TriageTest.input(q2Volume = null),
            TriageTest.input(q2TxCount = null),
            TriageTest.input(q2Days = null),
        ).forEach { assertThat(it.client.unbaselined).isTrue() }
    }

    @Test
    fun theReasonNamesEveryMissingBaselineFieldInOrder() {
        val input = TriageTest.input(expectedMonthlyVolume = null, q2Volume = 0.0, q2TxCount = null, q2Days = 0)
        assertThat(input.client.missingBaseline).containsExactly("expected_monthly_volume", "q2_volume", "q2_tx_count", "q2_days")
        assertThat(reasonOf(Triage.decide(input, baselineScored), "CLIENT_UNBASELINED").description)
            .contains("expected_monthly_volume", "q2_volume", "q2_tx_count", "q2_days")
    }

    @Test
    fun aFullyPopulatedClientIsBaselinedAndScoresNothing() {
        val input = TriageTest.input()
        assertThat(input.client.unbaselined).isFalse()
        assertThat(input.client.missingBaseline).isEmpty()
        val reason = reasonOf(Triage.decide(input, baselineScored), "CLIENT_UNBASELINED")
        assertThat(reason.points).isZero()
        assertThat(reason.description).contains("usable")
    }

    // ---- the CLIENT_UNBASELINED floor --------------------------------------------------------------------------

    private val floored = base.copy(floors = base.floors + Floor(FloorCondition.CLIENT_UNBASELINED, null, Disposition.REVIEW_LOW))

    @Test
    fun anUnprofileableClientCanNeverBeAutoClosed() {
        val closeable = Triage.decide(TriageTest.input(hits = listOf(TriageTest.hit("W1"))), floored)
        assertThat(closeable.disposition).describedAs("the same alert on a baselined client").isEqualTo(Disposition.AUTO_CLOSE)

        val unbaselined = Triage.decide(TriageTest.input(hits = listOf(TriageTest.hit("W1")), q2Volume = 0.0), floored)
        assertThat(unbaselined.score).describedAs("the floor moves the disposition, not the score").isEqualTo(closeable.score)
        assertThat(unbaselined.disposition).isEqualTo(Disposition.REVIEW_LOW)
        assertThat(unbaselined.reasons.map { it.code }).contains("FLOOR_CLIENT_UNBASELINED")
    }

    @Test
    fun theUnbaselinedFloorNeverSoftensAnAlreadyStricterDisposition() {
        val decision = Triage.decide(TriageTest.input(hits = listOf(TriageTest.hit("BIG")), q2Days = 0), floored)
        assertThat(decision.disposition).isEqualTo(Disposition.REVIEW_HIGH)
        assertThat(decision.reasons.map { it.code }).doesNotContain("FLOOR_CLIENT_UNBASELINED")
    }

    // ---- RequiredField.CLIENT_EXPECTED_VOLUME ------------------------------------------------------------------

    private val volumeRequired = base.copy(requiredFields = base.requiredFields + RequiredField.CLIENT_EXPECTED_VOLUME)

    @Test
    fun anAbsentDeclaredVolumeIsTreatedAsMissingDataAndForcesAReview() {
        listOf(0.0, null).forEach { declared ->
            val decision = Triage.decide(TriageTest.input(expectedMonthlyVolume = declared), volumeRequired)
            assertThat(decision.disposition).describedAs("declared $declared").isGreaterThanOrEqualTo(Disposition.REVIEW_MEDIUM)
            assertThat(decision.reasons.filter { it.code == "DATA_MISSING" }.map { it.description })
                .describedAs("declared $declared")
                .anyMatch { it.contains(RequiredField.CLIENT_EXPECTED_VOLUME.key) }
        }
    }

    @Test
    fun aDeclaredVolumeAboveZeroIsNotMissingData() {
        val decision = Triage.decide(TriageTest.input(expectedMonthlyVolume = 1.0), volumeRequired)
        assertThat(decision.reasons.filter { it.code == "DATA_MISSING" }.map { it.description })
            .noneMatch { it.contains(RequiredField.CLIENT_EXPECTED_VOLUME.key) }
    }

    // ---- the invariant, with the client factor live ------------------------------------------------------------

    @Test
    fun theReasonsStillReconstructTheScoreWithTheClientFactorScoring() {
        val decision = Triage.decide(
            TriageTest.input(hits = listOf(TriageTest.hit("N1")), amount = 300_000.0, q2Volume = 0.0),
            baselineScored,
        )
        assertThat(reasonOf(decision, "CLIENT_UNBASELINED").points).isEqualTo(10)
        assertThat(decision.reasons.sumOf { it.points }).isEqualTo(decision.score)
    }

    private fun reasonOf(decision: TriageDecision, code: String): Reason =
        decision.reasons.firstOrNull { it.code == code } ?: error("no '$code' reason in ${decision.reasons.map { it.code }}")
}
