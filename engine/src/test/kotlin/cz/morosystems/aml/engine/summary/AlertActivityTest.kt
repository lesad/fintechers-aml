package cz.morosystems.aml.engine.summary

import java.math.BigDecimal
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AlertActivityTest {
    private fun hit(day: String, volume: Double) =
        RuleHitRow("A1", "day_volume > 25 * p.pct", day, mapOf("day_volume" to volume, "p.pct" to 25, "payers" to listOf(day)), mapOf("p.pct" to "percent"))

    @Test
    fun countsHitsAndGivesRangesInCode() {
        val activity = ruleActivity("A1", listOf(hit("2026-07-01", 300.0), hit("2026-07-02", 100.0), hit("2026-07-03", 200.0)))

        assertThat(activity.ref).isEqualTo("rule:A1")
        assertThat(activity.data["hits"]).isEqualTo(3)
        assertThat(activity.data["grainKeys"]).isEqualTo(listOf("2026-07-01", "2026-07-02", "2026-07-03"))
        val evidence = activity.data["evidence"] as Map<*, *>
        assertThat(evidence["day_volume"]).isEqualTo(mapOf("min" to BigDecimal("100"), "max" to BigDecimal("300")))
        assertThat(evidence["p.pct"]).isEqualTo(25)
        assertThat(evidence["payers"]).isEqualTo(listOf(listOf("2026-07-01"), listOf("2026-07-02"), listOf("2026-07-03")))
    }

    @Test
    fun namesTheUnitOfEachParameter() {
        assertThat(ruleActivity("A1", listOf(hit("2026-07-01", 300.0))).data["units"]).isEqualTo(mapOf("p.pct" to "percent"))
    }

    @Test
    fun keepsASingleHitsValuesAsTheyAre() {
        val evidence = ruleActivity("A1", listOf(hit("2026-07-01", 300.0))).data["evidence"] as Map<*, *>
        assertThat(evidence["day_volume"]).isEqualTo(300.0)
    }
}
