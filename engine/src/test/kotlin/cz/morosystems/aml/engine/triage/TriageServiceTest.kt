package cz.morosystems.aml.engine.triage

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.run.RunService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.transaction.annotation.Transactional

/** Triage over a real run: one verdict per alert, and re-running it replaces rather than duplicates. */
@PostgresTest
class TriageServiceTest {
    @Autowired
    lateinit var runs: RunService

    @Autowired
    lateinit var triage: TriageService

    @Autowired
    lateinit var repository: TriageRepository

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

    @Test
    fun writesOneTriageRowPerAlert() {
        val runId = runs.run().runId
        assertThat(triageRows(runId)).isEqualTo(alertCount(runId)).isPositive()
    }

    @Test
    fun reTriagingARunIsIdempotent() {
        val runId = runs.run().runId
        val before = hashes(runId)
        val decisions = triage.triageRun(runId)

        assertThat(decisions).hasSize(before.size)
        assertThat(triageRows(runId)).isEqualTo(before.size.toLong())
        assertThat(hashes(runId)).isEqualTo(before)
    }

    // Both rule-name tests edit the seeded `rule` table, which the Postgres container shares with every other test
    // in this context: @Transactional rolls the edit back so the next test still sees the seeded names.
    @Test
    @Transactional
    fun theRuleNamesComeFromTheLatestVersionOfEachKey() {
        jdbc.sql("update rule set name = 'An older name' where key = 'C1' and version = 1").update()
        jdbc.sql("update rule set name = 'The current name' where key = 'C1' and version = 2").update()

        assertThat(repository.ruleNames()).containsEntry("C1", "The current name")
    }

    @Test
    @Transactional
    fun aRuleWithoutANameIsLeftOutRatherThanNamedNull() {
        jdbc.sql("update rule set name = null where key = 'A1'").update()

        assertThat(repository.ruleNames()).doesNotContainKey("A1").containsKey("A2")
    }

    @Test
    fun theReasonsNameTheRulesThatFired() {
        val runId = runs.run().runId
        val descriptions = jdbc.sql("select t.reasons::text from alert_triage t join alert a on a.id = t.alert_id where a.run_id = ?")
            .param(runId).query(String::class.java).list().filterNotNull()

        // Whichever rule this fixture fires, its base-score line carries the rule table's name before the key.
        val named = Regex("""base score for [^"(]+ \([A-Z]\d\)""")
        assertThat(descriptions).isNotEmpty().anyMatch { named.containsMatchIn(it) }
    }

    @Test
    fun everyStoredDispositionIsAKnownOne() {
        val runId = runs.run().runId
        val stored = jdbc.sql("select t.disposition from alert_triage t join alert a on a.id = t.alert_id where a.run_id = ?")
            .param(runId).query(String::class.java).list().filterNotNull()
        assertThat(stored).isNotEmpty().allMatch { name -> Disposition.entries.any { it.name == name } }
    }

    @Test
    fun anEscalateVerdictSendsANewAlertToTheManager() {
        val runId = runs.run().runId
        val mismatched = jdbc.sql(
            "select count(*) from alert a join alert_triage t on t.alert_id = a.id where a.run_id = ? and (t.disposition = 'ESCALATE') <> (a.status = 'ESCALATED')",
        ).param(runId).query(Long::class.java).single()
        assertThat(mismatched).isZero()

        val (fresh, decided) = jdbc.sql("select id from alert where run_id = ? order by id limit 2").param(runId).query(Long::class.java).list().map { it!! }
        jdbc.sql("update alert set status = 'NEW' where id = ?").param(fresh).update()
        jdbc.sql("update alert set status = 'FALSE_POSITIVE' where id = ?").param(decided).update()
        repository.save(listOf(fresh, decided).map { TriageDecision(it, Disposition.ESCALATE, 90, emptyList(), "test", "hash-$it") })

        assertThat(status(fresh)).isEqualTo("ESCALATED")
        assertThat(status(decided)).isEqualTo("FALSE_POSITIVE")
    }

    private fun status(alertId: Long) =
        jdbc.sql("select status from alert where id = ?").param(alertId).query(String::class.java).single()

    private fun hashes(runId: Long): Map<Long, String> =
        jdbc.sql("select t.alert_id, t.input_hash from alert_triage t join alert a on a.id = t.alert_id where a.run_id = ?")
            .param(runId).query { rs, _ -> rs.getLong(1) to rs.getString(2) }.list().toMap()

    private fun triageRows(runId: Long) =
        jdbc.sql("select count(*) from alert_triage t join alert a on a.id = t.alert_id where a.run_id = ?")
            .param(runId).query(Long::class.java).single()

    private fun alertCount(runId: Long) =
        jdbc.sql("select count(*) from alert where run_id = ?").param(runId).query(Long::class.java).single()

    private fun client(id: String, pep: Boolean) {
        jdbc.sql(
            """
            insert into client (id, country, contract_date, pep, type, channel, risk, expected_monthly_volume, q2_volume, q2_tx_count, q2_max_tx, q2_days)
            values (?, 'CZ', '2026-06-01', ?, 'legal entity', 'in person', 'low', 100000000000, 0, 0, 0, 91)
            """,
        ).params(id, pep).update()
    }

    private fun tx(id: String, client: String, ts: String, amountCzk: Long, direction: String, payer: String?, payee: String?) {
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country, payer_account, payee_account, type, direction)
            values (?, ?, ?::timestamp, ?, ?, 'CZK', 1, 'CZ', 'CZ', ?, ?, 'x', ?)
            """,
        ).params(listOf(id, client, ts, amountCzk * 100, amountCzk, payer, payee, direction)).update()
    }
}
