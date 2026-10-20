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

    @Test
    fun exportsTheLatestRunInTheMandatedColumns() {
        jdbc.sql(
            "insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash) " +
                "values (?, 'REVIEW_HIGH', 70, '[{\"code\":\"RULE_BASE\",\"description\":\"base score for B2\",\"points\":70}]', 'v1', 'h')",
        ).param(alertId).update()
        val result = assertThat(mvc.get().uri("/api/alerts/export.csv")).hasStatusOk()
        result.headers().hasValue("Content-Disposition", "attachment; filename=\"alerts-${latestRun()}.csv\"")
        val lines = result.bodyText().actual().lines().filter { it.isNotEmpty() }
        assertThat(lines.first())
            .isEqualTo("alert_id,alert_type,client_id,transaction_id,triage,priority,executive_role,executive_person,approver,reason,log")
        assertThat(lines.drop(1)).singleElement().asString()
            .startsWith("$alertId,B,K1,T1,REVIEW,70,ANALYST,J. Novák,M. Svobodová,\"REVIEW_HIGH, score 70: base score for B2.\",")
    }

    @Test
    fun aPersonsFalsePositiveWinsOverTheEngineAndNamesThemInTheReason() {
        jdbc.sql(
            "insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash) values (?, 'REVIEW_LOW', 30, '[]', 'v1', 'h')",
        ).param(alertId).update()
        jdbc.sql(
            "insert into case_event (run_id, transaction_id, actor_id, action, reason) " +
                "select ?, 'T1', id, 'FALSE_POSITIVE', 'salary' from app_user where role = 'ANALYST'",
        ).param(latestRun()).update()
        val body = assertThat(mvc.get().uri("/api/alerts/export.csv")).hasStatusOk().bodyText().actual()
        assertThat(body).contains("$alertId,B,K1,T1,FP,30,").contains("Final decision FALSE_POSITIVE by J. Novák: salary")
    }

    private fun latestRun(): Long = jdbc.sql("select max(id) from run").query(Long::class.java).single()

    private fun run(): Long =
        jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id").query(Long::class.java).single()

    private fun alert(runId: Long, type: String, client: String): Long =
        jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, ?, ?, 'T1') returning id")
            .params(runId, type, client).query(Long::class.java).single()
}
