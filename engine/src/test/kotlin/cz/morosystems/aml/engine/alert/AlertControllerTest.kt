package cz.morosystems.aml.engine.alert

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
class AlertControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    private var oldRun = 0L
    private var alertId = 0L

    @BeforeEach
    fun data() {
        jdbc.sql("truncate run cascade").update()
        oldRun = run()
        alert(oldRun, "A", "K9")
        val latest = run()
        alertId = alert(latest, "B", "K1")
    }

    @Test
    fun listsTheLatestFinishedRun() {
        assertThat(mvc.get().uri("/api/alerts")).hasStatusOk()
            .bodyJson().extractingPath("$[*].clientId").asArray().containsExactly("K1")
    }

    @Test
    fun listsAnEarlierRunById() {
        assertThat(mvc.get().uri("/api/alerts?runId=$oldRun")).hasStatusOk()
            .bodyJson().extractingPath("$[*].alertType").asArray().containsExactly("A")
    }

    @Test
    fun returnsOneAlert() {
        val result = assertThat(mvc.get().uri("/api/alerts/$alertId")).hasStatusOk().bodyJson()
        result.extractingPath("$.clientId").isEqualTo("K1")
        result.extractingPath("$.transactionId").isEqualTo("T1")
    }

    @Test
    fun unknownAlertIsNotFound() {
        assertThat(mvc.get().uri("/api/alerts/999999")).hasStatus(HttpStatus.NOT_FOUND)
    }

    private fun run(): Long =
        jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id").query(Long::class.java).single()

    private fun alert(runId: Long, type: String, client: String): Long =
        jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, ?, ?, 'T1') returning id")
            .params(runId, type, client).query(Long::class.java).single()
}
