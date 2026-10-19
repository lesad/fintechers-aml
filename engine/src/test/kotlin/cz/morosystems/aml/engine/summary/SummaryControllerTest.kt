package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.bedrock.Bedrock
import cz.morosystems.aml.engine.bedrock.BedrockException
import cz.morosystems.aml.engine.bedrock.BedrockProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.assertj.MockMvcTester

/** Stands in for Bedrock: returns [reply], or throws [failure] when set, and remembers the system and user prompts it was given. */
class FakeBedrock : Bedrock(BedrockProperties(modelId = "fake-model")) {
    var reply = ""
    var prompt = ""
    var system = ""
    var failure: RuntimeException? = null

    override fun askJson(system: String, prompt: String, schemaName: String, schema: String): String {
        this.system = system
        this.prompt = prompt
        failure?.let { throw it }
        return reply
    }
}

@TestConfiguration(proxyBeanMethods = false)
class FakeBedrockConfig {
    @Bean
    @Primary
    fun fakeBedrock() = FakeBedrock()
}

@PostgresTest
@AutoConfigureMockMvc
@Import(FakeBedrockConfig::class)
class SummaryControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    @Autowired
    lateinit var bedrock: FakeBedrock

    private var alertId = 0L
    private var hitId = 0L

    @BeforeEach
    fun data() {
        bedrock.failure = null
        jdbc.sql("truncate run cascade").update()
        val run = jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id").query(Long::class.java).single()
        val rule = jdbc.sql("select id from rule where key = 'C1' order by version desc limit 1").query(Long::class.java).single()
        hitId = jdbc.sql("insert into rule_hit (run_id, rule_id, client_id, grain_key, evidence) values (?, ?, 'K2', 'T2', ?::jsonb) returning id")
            .params(run, rule, """{"inflow": 110000, "outflow": 90000, "p.min_inflow": 100000}""").query(Long::class.java).single()
        alertId = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, 'C', 'K2', 'T2') returning id")
            .params(run).query(Long::class.java).single()
        jdbc.sql("insert into alert_hit (alert_id, hit_id) values (?, ?)").params(alertId, hitId).update()
        jdbc.sql(
            "insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash) values (?, 'REVIEW_HIGH', 55, ?::jsonb, 'test', 'x')",
        ).params(alertId, """[{"code":"RULE_BASE","points":45,"description":"base score for C1"},{"code":"CLIENT_RISK","points":10,"description":"client AML rating 'medium'"}]""").update()
    }

    @Test
    fun generatesStoresAndReturnsTheSummary() {
        bedrock.reply = """{"sentences":[{"text":"C1 fired: CZK 110,000 in, CZK 90,000 out.","refs":["rule:C1"]}]}"""

        val created = assertThat(mvc.post().uri("/api/alerts/$alertId/summary")).hasStatusOk().bodyJson()
        created.extractingPath("$.kind").isEqualTo("summary")
        created.extractingPath("$.status").isEqualTo("ready")
        created.extractingPath("$.body.sentences[0].text").isEqualTo("C1 fired: CZK 110,000 in, CZK 90,000 out.")
        created.extractingPath("$.body.sentences[0].refs[0]").isEqualTo("rule:C1")
        created.extractingPath("$.modelId").isEqualTo("fake-model")
        created.extractingPath("$.inputHash").asString().hasSize(64)
        assertThat(bedrock.prompt).contains("\"ref\":\"rule:C1\"", "\"hits\":1", "\"inflow\":110000", "\"condition\":")
            .contains("\"ref\":\"triage:decision\"", "\"disposition\":\"REVIEW_HIGH\"", "\"ref\":\"triage:CLIENT_RISK\"")

        assertThat(mvc.get().uri("/api/alerts/$alertId/summary")).hasStatusOk()
            .bodyJson().extractingPath("$.body.sentences[0].text").isEqualTo("C1 fired: CZK 110,000 in, CZK 90,000 out.")
    }

    @Test
    fun acceptsCitationsOfTriage() {
        bedrock.reply = """{"sentences":[{"text":"Triage put it at REVIEW_HIGH, 55 points.","refs":["triage:decision","triage:RULE_BASE"]}]}"""
        assertThat(mvc.post().uri("/api/alerts/$alertId/summary")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("ready")
    }

    @Test
    fun neverRunIsNotFound() {
        assertThat(mvc.get().uri("/api/alerts/$alertId/summary")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun rejectsAndStoresAnUnknownCitation() {
        bedrock.reply = """{"sentences":[{"text":"Made up.","refs":["hit:999999"]}]}"""
        val rejected = assertThat(mvc.post().uri("/api/alerts/$alertId/summary")).hasStatusOk().bodyJson()
        rejected.extractingPath("$.status").isEqualTo("rejected")
        rejected.extractingPath("$.body").isNull()
        rejected.extractingPath("$.error").asString().contains("hit:999999")
        assertThat(mvc.get().uri("/api/alerts/$alertId/summary")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("rejected")
    }

    @Test
    fun rejectsANumberNotInTheInput() {
        bedrock.reply = """{"sentences":[{"text":"C1 fired on CZK 111,000.","refs":["rule:C1"]}]}"""
        val rejected = assertThat(mvc.post().uri("/api/alerts/$alertId/summary")).hasStatusOk().bodyJson()
        rejected.extractingPath("$.status").isEqualTo("rejected")
        rejected.extractingPath("$.error").asString().contains("111,000")
    }

    @Test
    fun rejectsAReplyThatIsNotJson() {
        bedrock.reply = "Sure, here is a summary."
        assertThat(mvc.post().uri("/api/alerts/$alertId/summary")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("rejected")
    }

    @Test
    fun aModelErrorIsStoredAsFailed() {
        bedrock.failure = BedrockException("Bedrock stopped with max_tokens")
        val failed = assertThat(mvc.post().uri("/api/alerts/$alertId/summary")).hasStatusOk().bodyJson()
        failed.extractingPath("$.status").isEqualTo("failed")
        failed.extractingPath("$.error").isEqualTo("Bedrock stopped with max_tokens")
    }

    @Test
    fun unknownAlertIsNotFound() {
        assertThat(mvc.post().uri("/api/alerts/999999/summary")).hasStatus(HttpStatus.NOT_FOUND)
    }
}
