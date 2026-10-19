package cz.morosystems.aml.engine.transaction

import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.assertj.MockMvcTester

@PostgresTest
@AutoConfigureMockMvc
class TransactionControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    @BeforeEach
    fun data() {
        jdbc.sql("truncate run, transaction, client cascade").update()
        client("K1", pep = true, risk = "high")
        client("K2", pep = false, risk = "low")
        client("K3", pep = false, risk = "medium")
        tx("T1", "K1", "2026-07-03 10:00", 184_500.0, "out")
        tx("T2", "K2", "2026-07-04 09:00", 50_000.0, "in")
        tx("T3", "K3", "2026-07-05 12:00", 70_000.0, "in")
        tx("T4", "K1", "2026-07-02 08:00", 1_000.0, "in")
        tx("T5", "K2", "2026-07-06 08:00", 2_000.0, "in")
        tx("T9", "K1", "2026-07-01 08:00", 500.0, "out")

        val old = run()
        alert(old, "C", "K3", "T3", "C1", "ESCALATE", 99) // an earlier run: must not show
        val latest = run()
        alert(latest, "B", "K1", "T1", "B2", "ESCALATE", 90)
        alert(latest, "A", "K2", "T2", "A1", "REVIEW_LOW", 20)
        alert(latest, "A", "K3", "T3", "A2", "REVIEW_MEDIUM", 50)
        alert(latest, "A", "K1", "T4", "A1", "REVIEW_HIGH", 70)
        alert(latest, "A", "K2", "T5", "A1", "AUTO_CLOSE", 5)
    }

    @Test
    fun listsTheQueueMostSevereDispositionFirstWithoutAutoClosed() {
        val body = assertThat(mvc.get().uri("/api/transactions")).hasStatusOk().bodyJson()
        body.extractingPath("$.items[*].id").asArray().containsExactly("T1", "T4", "T3", "T2")
        body.extractingPath("$.items[*].disposition").asArray()
            .containsExactly("ESCALATE", "REVIEW_HIGH", "REVIEW_MEDIUM", "REVIEW_LOW")
        body.extractingPath("$.items[*].rating").asArray().containsExactly("High", "High", "Medium", "Low")
        body.extractingPath("$.items[0].score").isEqualTo(90)
        body.extractingPath("$.items[0].status").isEqualTo("NEW")
        body.extractingPath("$.items[0].rules[*].key").asArray().containsExactly("B2")
        body.extractingPath("$.items[0].rules[0].name").isEqualTo("PEP outgoing payment above the limit")
        body.extractingPath("$.items[0].amount").isEqualTo(184_500.0)
        body.extractingPath("$.total").isEqualTo(4)
        body.extractingPath("$.countsByRating.High").isEqualTo(2)
        body.extractingPath("$.countsByRating.Medium").isEqualTo(1)
        body.extractingPath("$.countsByRating.Low").isEqualTo(1)
    }

    @Test
    fun pagesAndFilters() {
        assertThat(mvc.get().uri("/api/transactions?page=1&size=2")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T3", "T2")

        val byRating = assertThat(mvc.get().uri("/api/transactions?rating=High")).hasStatusOk().bodyJson()
        byRating.extractingPath("$.items[*].id").asArray().containsExactly("T1", "T4")
        byRating.extractingPath("$.total").isEqualTo(2)
        byRating.extractingPath("$.countsByRating.Low").isEqualTo(1)

        assertThat(mvc.get().uri("/api/transactions?q=k2")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T2")
    }

    @Test
    fun setsTheStatusOfTheLatestRunsAlerts() {
        assertThat(putStatus("T3", "ESCALATED")).hasStatus(HttpStatus.NO_CONTENT)
        val escalated = assertThat(mvc.get().uri("/api/transactions?status=ESCALATED")).hasStatusOk().bodyJson()
        escalated.extractingPath("$.items[*].id").asArray().containsExactly("T3")
        escalated.extractingPath("$.items[0].status").isEqualTo("ESCALATED")
        assertThat(mvc.get().uri("/api/transactions/T3")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("ESCALATED")
        assertThat(putStatus("T3", "REPORTED")).hasStatus(HttpStatus.NO_CONTENT)
        assertThat(mvc.get().uri("/api/transactions/T3")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("REPORTED")
        val earlier = jdbc.sql("select status from alert where transaction_id = 'T3' and run_id = (select min(id) from run)")
            .query(String::class.java).single()
        assertThat(earlier).isEqualTo("NEW")

        assertThat(putStatus("T3", "CLOSED")).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(putStatus("T9", "ESCALATED")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun aStatusChangeNeedsAKnownUserAndRecordsThem() {
        val reviewer = jdbc.sql("select id from app_user where role = 'REVIEWER'").query(Long::class.java).single()
        assertThat(putStatus("T3", "ESCALATED", user = null)).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(putStatus("T3", "ESCALATED", user = 999_999)).hasStatus(HttpStatus.BAD_REQUEST)

        assertThat(putStatus("T3", "ESCALATED", user = reviewer)).hasStatus(HttpStatus.NO_CONTENT)
        val by = jdbc.sql("select distinct status_by from alert where transaction_id = 'T3' and run_id = (select max(id) from run)")
            .query(Long::class.java).single()
        assertThat(by).isEqualTo(reviewer)
    }

    private fun putStatus(id: String, status: String, user: Long? = firstUser()) =
        mvc.put().uri("/api/transactions/$id/status").contentType(MediaType.APPLICATION_JSON).content("""{"status": "$status"}""")
            .apply { if (user != null) header("X-User-Id", user.toString()) }

    private fun firstUser(): Long = jdbc.sql("select min(id) from app_user").query(Long::class.java).single()

    @Test
    fun pagesTheClientsHistoryAroundATransaction() {
        // K1 has T9 (07-01), T4 (07-02), T1 (07-03); around T4 one each way, around T1 only older.
        val older = assertThat(mvc.get().uri("/api/transactions/T4/history?direction=older&limit=5")).hasStatusOk().bodyJson()
        older.extractingPath("$.items[*].id").asArray().containsExactly("T9")
        older.extractingPath("$.more").isEqualTo(false)
        assertThat(mvc.get().uri("/api/transactions/T4/history?direction=newer")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T1")

        val first = assertThat(mvc.get().uri("/api/transactions/T1/history?direction=older&limit=1")).hasStatusOk().bodyJson()
        first.extractingPath("$.items[*].id").asArray().containsExactly("T4")
        first.extractingPath("$.items[0].alertTypes").asArray().containsExactly("A")
        first.extractingPath("$.more").isEqualTo(true)
        assertThat(mvc.get().uri("/api/transactions/T4/history?direction=older&limit=1")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T9")
        assertThat(mvc.get().uri("/api/transactions/T1/history?direction=newer")).hasStatusOk()
            .bodyJson().extractingPath("$.items").asArray().isEmpty()

        assertThat(mvc.get().uri("/api/transactions/T1/history?direction=sideways")).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(mvc.get().uri("/api/transactions/NOPE/history?direction=older")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun filtersByAlertStatus() {
        jdbc.sql("update alert set status = 'ESCALATED' where transaction_id = 'T3' and run_id = (select max(id) from run)").update()
        jdbc.sql("update alert set status = 'REPORTED' where transaction_id = 'T2'").update()

        val escalated = assertThat(mvc.get().uri("/api/transactions?status=ESCALATED")).hasStatusOk().bodyJson()
        escalated.extractingPath("$.items[*].id").asArray().containsExactly("T3")
        escalated.extractingPath("$.total").isEqualTo(1)

        assertThat(mvc.get().uri("/api/transactions?status=ESCALATED&status=REPORTED")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T3", "T2")
        assertThat(mvc.get().uri("/api/transactions?status=NEW")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T1", "T4")
    }

    @Test
    fun rejectsBadPaging() {
        assertThat(mvc.get().uri("/api/transactions?size=0")).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(mvc.get().uri("/api/transactions?rating=Critical")).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(mvc.get().uri("/api/transactions?status=CLOSED")).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun returnsTheDetailWithTriageEvidenceAndHistory() {
        val body = assertThat(mvc.get().uri("/api/transactions/T1")).hasStatusOk().bodyJson()
        body.extractingPath("$.transaction.payeeAccount").isEqualTo("AAT00116")
        body.extractingPath("$.client.pep").isEqualTo(true)
        body.extractingPath("$.rating").isEqualTo("High")
        body.extractingPath("$.disposition").isEqualTo("ESCALATE")
        body.extractingPath("$.alerts[0].alertType").isEqualTo("B")
        body.extractingPath("$.alerts[0].triage.score").isEqualTo(90)
        body.extractingPath("$.alerts[0].triage.reasons[0].code").isEqualTo("B2")
        body.extractingPath("$.alerts[0].triage.configVersion").isEqualTo("test-v1")
        body.extractingPath("$.alerts[0].hits[0].rule").isEqualTo("B2")
        body.extractingPath("$.alerts[0].hits[0].name").isEqualTo("PEP outgoing payment above the limit")
        body.extractingPath("$.alerts[0].hits[0].evidence['tx.amount']").isEqualTo(184_500)
        body.extractingPath("$.day[*].id").asArray().containsExactly("T1")
        body.extractingPath("$.historyCount").isEqualTo(3)
    }

    @Test
    fun anAutoClosedTransactionKeepsItsDispositionInTheDetail() {
        val body = assertThat(mvc.get().uri("/api/transactions/T5")).hasStatusOk().bodyJson()
        body.extractingPath("$.disposition").isEqualTo("AUTO_CLOSE")
        body.extractingPath("$.rating").isEqualTo("Low")
    }

    @Test
    fun anUnflaggedTransactionHasNoRating() {
        val body = assertThat(mvc.get().uri("/api/transactions/T9")).hasStatusOk().bodyJson()
        body.extractingPath("$.rating").isNull()
        body.extractingPath("$.disposition").isNull()
        body.extractingPath("$.alerts").asArray().isEmpty()
    }

    @Test
    fun unknownTransactionIsNotFound() {
        assertThat(mvc.get().uri("/api/transactions/NOPE")).hasStatus(HttpStatus.NOT_FOUND)
    }

    private fun client(id: String, pep: Boolean, risk: String) {
        jdbc.sql(
            """
            insert into client (id, country, contract_date, channel, pep, type, expected_monthly_volume, expected_count,
                                q2_volume, q2_tx_count, q2_max_tx, q2_days, risk)
            values (?, 'CZ', '2019-03-14', 'in person', ?, 'legal entity', 400000, 55, 1620000, 182, 61400, 91, ?)
            """,
        ).params(id, pep, risk).update()
    }

    private fun tx(id: String, client: String, ts: String, amount: Double, direction: String) {
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country,
                                     payer_account, payee_account, type, direction)
            values (?, ?, ?::timestamp, ?, ?, 'CZK', 1, 'CZ', 'AT', ?, 'AAT00116', 'outgoing payment', ?)
            """,
        ).params(id, client, ts, amount, amount, client, direction).update()
    }

    private fun run(): Long =
        jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id")
            .query(Long::class.java).single()

    @Suppress("LongParameterList") // test fixture: one call spells out the whole alert
    private fun alert(runId: Long, type: String, client: String, txId: String, rule: String, disposition: String, score: Int) {
        val hit = jdbc.sql(
            """
            insert into rule_hit (run_id, rule_id, client_id, grain_key, evidence)
            values (?, (select id from rule where key = ? and version = 1), ?, ?, '{"tx.amount": 184500}'::jsonb)
            returning id
            """,
        ).params(runId, rule, client, txId).query(Long::class.java).single()
        val alert = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, ?, ?, ?) returning id")
            .params(runId, type, client, txId).query(Long::class.java).single()
        jdbc.sql("insert into alert_hit (alert_id, hit_id) values (?, ?)").params(alert, hit).update()
        jdbc.sql(
            """
            insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash)
            values (?, ?, ?, ?::jsonb, 'test-v1', 'hash')
            """,
        ).params(alert, disposition, score, """[{"code": "$rule", "description": "rule $rule fired", "points": $score}]""").update()
    }
}
