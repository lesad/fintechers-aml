package cz.morosystems.aml.engine.assessment

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.summary.FakeBedrock
import cz.morosystems.aml.engine.summary.FakeBedrockConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.assertj.MockMvcTester
import software.amazon.awssdk.core.exception.SdkClientException

@PostgresTest
@AutoConfigureMockMvc
@Import(FakeBedrockConfig::class)
class AssessmentControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    @Autowired
    lateinit var bedrock: FakeBedrock

    private var alertId = 0L

    @AfterEach
    fun cleanUp() {
        jdbc.sql("truncate run, transaction, client cascade").update()
    }

    @BeforeEach
    fun data() {
        bedrock.failure = null
        cleanUp()
        jdbc.sql(
            """
            insert into client (id, country, contract_date, channel, pep, type, expected_monthly_volume, expected_count,
                                q2_volume, q2_tx_count, q2_max_tx, q2_days, risk)
            values ('K2', 'CZ', '2025-01-15', 'branch', false, 'company', 300000, 20, 900000, 60, 50000, 90, 'medium')
            """.trimIndent(),
        ).update()
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country,
                                     payer_account, payee_account, type, direction)
            values ('T2', 'K2', '2026-09-10 10:00:00', 90000, 90000, 'CZK', 1, null, 'CZ', 'K2-ACC', 'AAT00116', 'transfer', 'out')
            """.trimIndent(),
        ).update()
        val run = jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id").query(Long::class.java).single()
        val rule = jdbc.sql("select id from rule where key = 'C1' order by version desc limit 1").query(Long::class.java).single()
        val hit = jdbc.sql("insert into rule_hit (run_id, rule_id, client_id, grain_key, evidence) values (?, ?, 'K2', 'T2', ?::jsonb) returning id")
            .params(run, rule, """{"inflow": 110000, "outflow": 90000, "p.min_inflow": 100000}""").query(Long::class.java).single()
        alertId = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, 'C', 'K2', 'T2') returning id")
            .params(run).query(Long::class.java).single()
        jdbc.sql("insert into alert_hit (alert_id, hit_id) values (?, ?)").params(alertId, hit).update()
    }

    private fun reply(
        rating: String = "high",
        verdict: String = "pass_through",
        summaryRefs: String = "\"rule:C1\"",
        summaryText: String = "CZK 110,000 came in and CZK 90,000 left the same day.",
        sentences: Int = 1,
        normal: String = "A supplier payment settled from a customer payment.",
    ) =
        """
        {"rating":"$rating","verdict":"$verdict",
         "summary":[${List(sentences) { """{"text":"$summaryText","refs":[$summaryRefs]}""" }.joinToString(",")}],
         "openPoints":[{"question":{"text":"What was the source of the incoming CZK 110,000?","refs":["rule:C1"]},
           "suspicious":"No invoice matches the outgoing payments.","normal":"$normal","wouldSettle":"Invoices for the outgoing payments.","askWho":"client"}]}
        """.trimIndent()

    private fun triage(disposition: String) {
        jdbc.sql("insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash) values (?, ?, 50, '[]'::jsonb, 'test', 'h')")
            .params(alertId, disposition).update()
    }

    @Test
    fun theFocusFollowsTheDisposition() {
        triage("ESCALATE"); bedrock.reply = reply()
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk()
        assertThat(bedrock.system).contains("Focus: escalation")
        assertThat(mvc.get().uri("/api/alerts/$alertId/assessment")).hasStatusOk()
    }

    @Test
    fun anAlertWithoutTriageGetsNoFocus() {
        bedrock.reply = reply()
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk()
        assertThat(bedrock.system).doesNotContain("Focus:")
        assertThat(mvc.get().uri("/api/alerts/$alertId/assessment")).hasStatusOk()
    }

    @Test
    fun aResultFromAnotherPromptIsStillTheLatest() {
        jdbc.sql("insert into ai_result (alert_id, kind, status, body, model_id, prompt_hash, input_hash) values (?, 'assessment', 'ready', '{}'::jsonb, 'm', 'old', 'i')")
            .param(alertId).update()
        assertThat(mvc.get().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.promptHash").isEqualTo("old")
    }

    @Test
    fun generatesTheRating() {
        bedrock.reply = reply()

        val created = assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson()
        created.extractingPath("$.kind").isEqualTo("assessment")
        created.extractingPath("$.status").isEqualTo("ready")
        created.extractingPath("$.body.rating").isEqualTo("high")
        created.extractingPath("$.body.verdict").isEqualTo("pass_through")
        created.extractingPath("$.body.summary[0].refs[0]").isEqualTo("rule:C1")
        created.extractingPath("$.body.openPoints[0].askWho").isEqualTo("client")

        assertThat(mvc.get().uri("/api/alerts/$alertId/assessment")).hasStatusOk()
            .bodyJson().extractingPath("$.body.openPoints[0].wouldSettle").isEqualTo("Invoices for the outgoing payments.")
    }

    @Test
    fun theModelSeesTheFacts() {
        bedrock.reply = reply()
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk()
        assertThat(bedrock.prompt).contains("\"ref\":\"client:profile\"", "\"ref\":\"flow:activity\"")
    }

    @Test
    fun aSummaryMayCiteAFact() {
        bedrock.reply = reply(summaryRefs = "\"counterparty:AAT00116\"")
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("ready")
    }

    @Test
    fun aNumberFromTheFactsIsAccepted() {
        bedrock.reply = reply(summaryText = "The payment is 1.8 times the client's largest Q2 payment.", summaryRefs = "\"client:profile\"")
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("ready")
        assertThat(bedrock.prompt).contains("1.8")
    }

    @Test
    fun neverRunIsNotFound() {
        assertThat(mvc.get().uri("/api/alerts/$alertId/assessment")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun rejectsAnUnknownRef() {
        bedrock.reply = reply(summaryRefs = "\"rule:B1\"")
        val rejected = assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson()
        rejected.extractingPath("$.status").isEqualTo("rejected")
        rejected.extractingPath("$.error").asString().contains("summary[0]", "rule:B1")
        assertThat(mvc.get().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("rejected")
    }

    @Test
    fun aNumberNotInTheInputIsAWarning() {
        bedrock.reply = reply(summaryText = "About CZK 100,001 moved through.")
        val result = assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson()
        result.extractingPath("$.status").isEqualTo("ready")
        result.extractingPath("$.body.warnings[0].at").isEqualTo("summary[0]")
        result.extractingPath("$.body.warnings[0].message").asString().contains("100,001")
    }

    @Test
    fun aNumberFromThePromptIsKnown() {
        bedrock.reply = reply(summaryText = "Most of it left within 24 hours.")
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.body.warnings").asArray().isEmpty()
    }

    @Test
    fun rejectsARatingOffTheList() {
        bedrock.reply = reply(rating = "critical")
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.error").asString().contains("critical")
    }

    @Test
    fun rejectsAVerdictOffTheList() {
        bedrock.reply = reply(verdict = "high_risk")
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.error").asString().contains("high_risk")
    }

    @Test
    fun acceptsSixSummarySentencesAndRejectsSeven() {
        bedrock.reply = reply(sentences = 6)
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("ready")
        bedrock.reply = reply(sentences = 7)
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.error").asString().contains("summary has 7 items")
    }

    @Test
    fun aNumberInAnOpenPointIsAWarning() {
        bedrock.reply = reply(normal = "A payslip over CZK 120,000.")
        assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson().extractingPath("$.body.warnings[0].at").isEqualTo("openPoints[0].normal")
    }

    @Test
    fun aTransportErrorIsStoredAsFailed() {
        bedrock.failure = SdkClientException.create("Unable to load credentials")
        val failed = assertThat(mvc.post().uri("/api/alerts/$alertId/assessment")).hasStatusOk().bodyJson()
        failed.extractingPath("$.status").isEqualTo("failed")
        failed.extractingPath("$.error").asString().contains("credentials")
    }

    @Test
    fun unknownAlertIsNotFound() {
        assertThat(mvc.post().uri("/api/alerts/999999/assessment")).hasStatus(HttpStatus.NOT_FOUND)
    }
}
