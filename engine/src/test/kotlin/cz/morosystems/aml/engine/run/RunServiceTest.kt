package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.cel.RuleCompileException
import java.nio.file.Files
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
class RunServiceTest {
    @Autowired
    lateinit var runs: RunService

    @Autowired
    lateinit var jdbc: JdbcClient

    @BeforeEach
    fun data() {
        jdbc.sql("truncate run, client cascade").update()
        jdbc.sql("delete from reference_list").update()
        client("K1", pep = true)
        client("K2", pep = false)
        tx("T1", "K1", "2026-07-10 09:00", 150_000, "out", payer = "K1", payee = "ACZ9")
        tx("T2", "K2", "2026-07-11 10:00", 110_000, "in", payer = "ACZ1", payee = "K2")
        tx("T3", "K2", "2026-07-11 13:00", 90_000, "out", payer = "K2", payee = "ACZ7")
    }

    @AfterEach
    fun removeTestRules() {
        jdbc.sql("truncate run cascade").update()
        jdbc.sql("delete from rule where author = 'test'").update()
    }

    @Test
    fun raisesOnePepAndOneFlowThroughAlert() {
        val report = runs.run()
        assertThat(report.alertsPerType).isEqualTo(mapOf("B" to 1, "C" to 1))
        assertThat(report.hitsPerRule).isEqualTo(mapOf("B2" to 1, "C1" to 1))
    }

    @Test
    fun seasonalRuleFiresOnlyInItsMonth() {
        listOf("TJUL" to "tx.month == 7 && tx.amount > 0.0", "TDEC" to "tx.month == 12 && tx.amount > 0.0").forEach { (key, condition) ->
            jdbc.sql(
                """
                insert into rule (key, version, alert_type, layer, grain, condition, status, author)
                values (?, 1, 'A', 'company', 'transaction', ?, 'active', 'test')
                """,
            ).params(key, condition).update()
        }
        val hits = runs.run().hitsPerRule
        assertThat(hits).containsEntry("TJUL", 3)
        assertThat(hits).doesNotContainKey("TDEC")
    }

    @Test
    fun picksTheTriggeringTransactions() {
        val runId = runs.run().runId
        val picked = jdbc.sql("select alert_type, transaction_id from alert where run_id = ?").param(runId)
            .query { rs, _ -> rs.getString(1) to rs.getString(2) }.list().toMap()
        assertThat(picked).isEqualTo(mapOf("B" to "T1", "C" to "T2"))
    }

    @Test
    fun storesVariablesAndParametersAsEvidence() {
        val runId = runs.run().runId
        val evidence = jdbc.sql(
            "select h.evidence::text from rule_hit h join rule r on r.id = h.rule_id where h.run_id = ? and r.key = 'C1'",
        ).param(runId).query(String::class.java).single()
        assertThat(evidence).contains("\"inflow\": 110000", "\"outflow\": 90000", "\"payers\": [\"ACZ1\"]", "\"p.min_inflow\": 100000", "\"p.forward_pct\": 80")
    }

    @Test
    fun writesOneCsvLinePerAlert() {
        val report = runs.run()
        val lines = Files.readAllLines(report.csv)
        assertThat(lines.first()).isEqualTo("alert_id,disposition,score,alert_type,client_id,transaction_id,evidence")
        assertThat(lines.drop(1)).hasSize(2).allMatch { it.endsWith("\"") }
    }

    @Test
    fun failsBeforeWritingAnythingWhenARuleDoesNotCompile() {
        jdbc.sql(
            """
            insert into rule (key, version, alert_type, layer, grain, condition, status, author)
            values ('BAD', 1, 'A', 'company', 'transaction', 'tx.amount > "x"', 'active', 'test')
            """,
        ).update()
        assertThatThrownBy { runs.run() }
            .isInstanceOfSatisfying(RuleCompileException::class.java) { assertThat(it.ruleKey).isEqualTo("BAD") }
        assertThat(jdbc.sql("select count(*) from run").query(Long::class.java).single()).isZero()
    }

    @Test
    fun namesRuleAndClientWhenAConditionFailsAtRuntime() {
        jdbc.sql(
            """
            insert into rule (key, version, alert_type, layer, grain, condition, status, author)
            values ('DIV0', 1, 'A', 'company', 'transaction', 'client.q2_tx_count / 0 > 1', 'active', 'test')
            """,
        ).update()
        assertThatThrownBy { runs.run() }.hasMessageContaining("DIV0").hasMessageContaining("client K")
        assertThat(jdbc.sql("select count(*) from run").query(Long::class.java).single()).isZero()
    }

    @Test
    fun keepsEachRunsAlertsSeparate() {
        val first = runs.run().runId
        val firstAlerts = alertCount(first)
        val second = runs.run().runId
        assertThat(second).isNotEqualTo(first)
        assertThat(alertCount(first)).isEqualTo(firstAlerts)
        assertThat(alertCount(second)).isEqualTo(firstAlerts)
    }

    private fun alertCount(runId: Long) = jdbc.sql("select count(*) from alert where run_id = ?").param(runId).query(Long::class.java).single()

    private fun client(id: String, pep: Boolean) {
        jdbc.sql(
            """
            insert into client (id, country, pep, type, channel, risk, expected_monthly_volume, q2_volume, q2_tx_count, q2_max_tx, q2_days)
            values (?, 'CZ', ?, 'legal entity', 'in person', 'low', 1000000000, 0, 0, 0, 91)
            """,
        ).params(id, pep).update()
    }

    private fun tx(id: String, client: String, ts: String, amountCzk: Long, direction: String, payer: String?, payee: String?) {
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country, payer_account, payee_account, type, direction)
            values (?, ?, ?::timestamp, ?, ?, 'CZK', 1, 'CZ', 'CZ', ?, ?, 'x', ?)
            """,
        ).params(listOf(id, client, ts, amountCzk, amountCzk, payer, payee, direction)).update()
    }
}
