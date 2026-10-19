package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

/** The detection rows of the "Test cases" tables in `docs/rules/A-profile-discrepancy.md`, `B-high-risk-pep.md` and `C-flow-through.md`. */
@PostgresTest
class RuleAcceptanceTest {
    @Autowired
    lateinit var runs: RunService

    @Autowired
    lateinit var jdbc: JdbcClient

    @BeforeEach
    fun empty() {
        jdbc.sql("truncate run, client cascade").update()
        jdbc.sql("delete from reference_list").update()
    }

    @Test
    fun a1FiresAboveQuarterOfExpectedMonthly() {
        client("K1", expectedMonthly = 100_000)
        tx("T1", "K1", "2026-07-10 10:00", 30_000, "in")
        assertThat(alertTypes("K1")).containsExactly("A")
    }

    @Test
    fun a1DoesNotFireAtExactlyQuarter() {
        client("K1", expectedMonthly = 100_000)
        tx("T1", "K1", "2026-07-10 10:00", 25_000, "in")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun a2FiresAboveThreeTimesQ2AverageDay() {
        client("K1", q2Volume = 910_000, q2Count = 100, q2Max = 1_000_000)
        tx("T1", "K1", "2026-07-10 10:00", 31_000, "in")
        assertThat(hitRules("K1")).containsExactly("A2")
    }

    @Test
    fun a3FiresAboveTwiceQ2Maximum() {
        client("K1", q2Volume = 100_000_000, q2Count = 100, q2Max = 50_000)
        tx("T1", "K1", "2026-07-10 10:00", 100_001, "in")
        assertThat(hitRules("K1")).containsExactly("A3")
    }

    @Test
    fun aInactiveInQ2ComparesToExpectedOnly() {
        client("K1", expectedMonthly = 100_000)
        tx("T1", "K1", "2026-07-10 10:00", 20_000, "in")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun a2UsesProratedQ2BaselineForJuneContract() {
        client("K1", q2Volume = 300_000, q2Count = 30, q2Max = 1_000_000, q2Days = 30)
        tx("T1", "K1", "2026-07-10 10:00", 31_000, "in")
        assertThat(hitRules("K1")).containsExactly("A2")
    }

    @Test
    fun b2FiresOnPepOutgoingAboveHundredThousand() {
        client("K1", pep = true)
        tx("T1", "K1", "2026-07-10 10:00", 100_001, "out")
        assertThat(hitRules("K1")).containsExactly("B2")
    }

    @Test
    fun b2DoesNotFireAtExactlyHundredThousand() {
        client("K1", pep = true)
        tx("T1", "K1", "2026-07-10 10:00", 100_000, "out")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun b2IgnoresPepIncoming() {
        client("K1", pep = true)
        tx("T1", "K1", "2026-07-10 10:00", 500_000, "in")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun b2FiresOnPepRemittance() {
        client("K1", pep = true)
        tx("T1", "K1", "2026-07-10 10:00", 150_000, "unknown")
        assertThat(hitRules("K1")).containsExactly("B2")
    }

    @Test
    fun b1FiresOnHighRiskPayeeAboveTenThousand() {
        highRisk("IR")
        client("K1")
        tx("T1", "K1", "2026-07-10 10:00", 10_001, "out", payeeCountry = "IR")
        assertThat(hitRules("K1")).containsExactly("B1")
    }

    @Test
    fun b1DoesNotFireAtExactlyTenThousand() {
        highRisk("IR")
        client("K1")
        tx("T1", "K1", "2026-07-10 10:00", 10_000, "out", payeeCountry = "IR")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun bBothBranchesOnOneTransactionGiveOneAlert() {
        highRisk("IR")
        client("K1", pep = true)
        tx("T1", "K1", "2026-07-10 10:00", 200_000, "out", payeeCountry = "IR")
        assertThat(alertTypes("K1")).containsExactly("B")
        assertThat(hitRules("K1")).containsExactlyInAnyOrder("B1", "B2")
    }

    @Test
    fun cFiresWhenEightyTwoPercentIsForwarded() {
        client("K1")
        flowThrough(outCzk = 90_000)
        assertThat(alertTypes("K1")).containsExactly("C")
    }

    @Test
    fun cDoesNotFireBelowEightyPercent() {
        client("K1")
        flowThrough(outCzk = 85_000)
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun cIgnoresMoneySentBackToPayer() {
        client("K1")
        flowThrough(outCzk = 90_000, payee = "ACZ1")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun cDoesNotFireAtExactlyHundredThousandIn() {
        client("K1")
        tx("T1", "K1", "2026-07-10 10:00", 100_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-10 11:00", 100_000, "out", payee = "ACZ9")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun cDoesNotFireWhenForwardedSixHoursOneMinuteLater() {
        client("K1")
        tx("T1", "K1", "2026-07-10 10:00", 110_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-10 16:01", 90_000, "out", payee = "ACZ9")
        assertThat(alertTypes("K1")).isEmpty()
    }

    @Test
    fun cFiresAcrossMidnight() {
        client("K1")
        tx("T1", "K1", "2026-07-10 22:00", 60_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-10 23:30", 50_000, "in", payer = "ACZ2")
        tx("T3", "K1", "2026-07-11 01:00", 90_000, "out", payee = "ACZ9")
        assertThat(alertTypes("K1")).containsExactly("C")
    }

    @Test
    fun cCountsARemittanceAsOutflow() {
        client("K1")
        tx("T1", "K1", "2026-07-10 10:00", 110_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-10 12:00", 90_000, "unknown", payee = "ACZ9")
        assertThat(alertTypes("K1")).containsExactly("C")
    }

    private fun flowThrough(outCzk: Long, payee: String = "ACZ9") {
        tx("T1", "K1", "2026-07-10 08:00", 60_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-10 09:00", 50_000, "in", payer = "ACZ2")
        tx("T3", "K1", "2026-07-10 12:00", outCzk, "out", payee = payee)
    }

    private fun alertTypes(clientId: String): List<String?> {
        val runId = runs.run().runId
        return jdbc.sql("select alert_type from alert where run_id = ? and client_id = ? order by alert_type")
            .params(runId, clientId).query(String::class.java).list()
    }

    private fun hitRules(clientId: String): List<String?> {
        val runId = runs.run().runId
        return jdbc.sql("select r.key from rule_hit h join rule r on r.id = h.rule_id where h.run_id = ? and h.client_id = ? order by 1")
            .params(runId, clientId).query(String::class.java).list()
    }

    private fun highRisk(code: String) {
        jdbc.sql("insert into reference_list (list, code, valid_for, source) values ('high_risk', ?, '2026-07', 'test')").param(code).update()
    }

    private fun client(
        id: String,
        pep: Boolean = false,
        expectedMonthly: Long = 1_000_000_000,
        q2Volume: Long = 0,
        q2Count: Long = 0,
        q2Max: Long = 0,
        q2Days: Int = 91,
    ) {
        jdbc.sql(
            """
            insert into client (id, country, pep, type, channel, risk, expected_monthly_volume, q2_volume, q2_tx_count, q2_max_tx, q2_days)
            values (?, 'CZ', ?, 'legal entity', 'in person', 'low', ?, ?, ?, ?, ?)
            """,
        ).params(id, pep, expectedMonthly, q2Volume, q2Count, q2Max, q2Days).update()
    }

    private fun tx(
        id: String,
        client: String,
        ts: String,
        amountCzk: Long,
        direction: String,
        payer: String? = if (direction == "out") client else null,
        payee: String? = if (direction == "in") client else null,
        payeeCountry: String = "CZ",
    ) {
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country, payer_account, payee_account, type, direction)
            values (?, ?, ?::timestamp, ?, ?, 'CZK', 1, 'CZ', ?, ?, ?, 'x', ?)
            """,
        ).params(listOf(id, client, ts, amountCzk, amountCzk, payeeCountry, payer, payee, direction)).update()
    }
}
