package cz.morosystems.aml.engine.transaction

import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpStatus
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
        tx("T1", "K1", "2026-07-03 10:00", 18_450_000, "out")
        tx("T2", "K2", "2026-07-04 09:00", 5_000_000, "in")
        tx("T3", "K3", "2026-07-05 12:00", 7_000_000, "in")
        tx("T4", "K1", "2026-07-02 08:00", 100_000, "in")
        tx("T9", "K1", "2026-07-01 08:00", 50_000, "out")

        val old = run()
        alert(old, "C", "K3", "T3", "C1") // an earlier run: must not show
        val latest = run()
        // Inserted in this order, so flaggedAt orders T3 before T4 within Medium.
        alert(latest, "B", "K1", "T1", "B2")
        alert(latest, "A", "K2", "T2", "A1")
        alert(latest, "A", "K3", "T3", "A2")
        alert(latest, "A", "K1", "T4", "A1")
    }

    @Test
    fun listsFlaggedTransactionsOfTheLatestRunHighestRatingFirst() {
        val body = assertThat(mvc.get().uri("/api/transactions")).hasStatusOk().bodyJson()
        body.extractingPath("$.items[*].id").asArray().containsExactly("T1", "T3", "T4", "T2")
        body.extractingPath("$.items[*].rating").asArray().containsExactly("High", "Medium", "Medium", "Low")
        body.extractingPath("$.items[0].rules").asArray().containsExactly("B2")
        body.extractingPath("$.items[0].amountHalere").isEqualTo(18_450_000)
        body.extractingPath("$.total").isEqualTo(4)
        body.extractingPath("$.countsByRating.High").isEqualTo(1)
        body.extractingPath("$.countsByRating.Medium").isEqualTo(2)
        body.extractingPath("$.countsByRating.Low").isEqualTo(1)
    }

    @Test
    fun pagesAndFilters() {
        assertThat(mvc.get().uri("/api/transactions?page=1&size=2")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T4", "T2")

        val byRating = assertThat(mvc.get().uri("/api/transactions?rating=Medium")).hasStatusOk().bodyJson()
        byRating.extractingPath("$.items[*].id").asArray().containsExactly("T3", "T4")
        byRating.extractingPath("$.total").isEqualTo(2)
        byRating.extractingPath("$.countsByRating.High").isEqualTo(1)

        assertThat(mvc.get().uri("/api/transactions?q=k1")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T1", "T4")
    }

    @Test
    fun rejectsBadPaging() {
        assertThat(mvc.get().uri("/api/transactions?size=0")).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(mvc.get().uri("/api/transactions?rating=Critical")).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun returnsTheDetailWithClientAlertsAndHistory() {
        val body = assertThat(mvc.get().uri("/api/transactions/T1")).hasStatusOk().bodyJson()
        body.extractingPath("$.transaction.payeeAccount").isEqualTo("AAT00116")
        body.extractingPath("$.client.pep").isEqualTo(true)
        body.extractingPath("$.rating").isEqualTo("High")
        body.extractingPath("$.alerts[0].alertType").isEqualTo("B")
        body.extractingPath("$.alerts[0].hits[0].rule").isEqualTo("B2")
        body.extractingPath("$.alerts[0].hits[0].evidence['tx.amount']").isEqualTo(18_450_000)
        body.extractingPath("$.history[*].id").asArray().containsExactly("T1", "T4", "T9")
        body.extractingPath("$.history[1].alertTypes").asArray().containsExactly("A")
        body.extractingPath("$.history[2].alertTypes").asArray().isEmpty()
    }

    @Test
    fun anUnflaggedTransactionHasNoRating() {
        val body = assertThat(mvc.get().uri("/api/transactions/T9")).hasStatusOk().bodyJson()
        body.extractingPath("$.rating").isNull()
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
            values (?, 'CZ', '2019-03-14', 'in person', ?, 'legal entity', 40000000, 55, 162000000, 182, 6140000, 91, ?)
            """,
        ).params(id, pep, risk).update()
    }

    private fun tx(id: String, client: String, ts: String, amount: Long, direction: String) {
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country,
                                     payer_account, payee_account, type, direction)
            values (?, ?, ?::timestamp, ?, ?, 'CZK', 1, 'CZ', 'AT', ?, 'AAT00116', 'outgoing payment', ?)
            """,
        ).params(id, client, ts, amount, amount / 100.0, client, direction).update()
    }

    private fun run(): Long =
        jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id")
            .query(Long::class.java).single()

    private fun alert(runId: Long, type: String, client: String, txId: String, rule: String) {
        val hit = jdbc.sql(
            """
            insert into rule_hit (run_id, rule_id, client_id, grain_key, evidence)
            values (?, (select id from rule where key = ? and version = 1), ?, ?, '{"tx.amount": 18450000}'::jsonb)
            returning id
            """,
        ).params(runId, rule, client, txId).query(Long::class.java).single()
        val alert = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, ?, ?, ?) returning id")
            .params(runId, type, client, txId).query(Long::class.java).single()
        jdbc.sql("insert into alert_hit (alert_id, hit_id) values (?, ?)").params(alert, hit).update()
    }
}
