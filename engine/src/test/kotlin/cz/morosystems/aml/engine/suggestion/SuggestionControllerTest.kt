package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.summary.FakeBedrock
import cz.morosystems.aml.engine.summary.FakeBedrockConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.assertj.MockMvcTester

@PostgresTest
@AutoConfigureMockMvc
@Import(FakeBedrockConfig::class)
class SuggestionControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    @Autowired
    lateinit var bedrock: FakeBedrock

    private var alertId = 0L

    @BeforeEach
    fun data() {
        bedrock.prompt = ""
        jdbc.sql("truncate run cascade").update()
        jdbc.sql("insert into client (id, country, pep, type, channel, risk) values ('K2', 'CZ', false, 'person', 'branch', 'medium') on conflict (id) do nothing").update()
        run = jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id").query(Long::class.java).single()
        alertId = alertWithHit("T2")
        otherAlertId = alertWithHit("T3")
    }

    private var run = 0L
    private var otherAlertId = 0L

    /** A C1 alert for K2 with one hit on [grainKey]; the test data has no transactions, so any new C1 version stops it. */
    private fun alertWithHit(grainKey: String): Long {
        val rule = jdbc.sql("select id from rule where key = 'C1' and status = 'active'").query(Long::class.java).single()
        val hitId = jdbc.sql("insert into rule_hit (run_id, rule_id, client_id, grain_key, evidence) values (?, ?, 'K2', ?, ?::jsonb) returning id")
            .params(run, rule, grainKey, """{"inflow": 110000, "outflow": 90000, "p.min_inflow": 100000}""").query(Long::class.java).single()
        val id = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, 'C', 'K2', ?) returning id")
            .params(run, grainKey).query(Long::class.java).single()
        jdbc.sql("insert into alert_hit (alert_id, hit_id) values (?, ?)").params(id, hitId).update()
        return id
    }

    private fun triage(alert: Long, disposition: String) {
        jdbc.sql("insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash) values (?, ?, 50, '[]'::jsonb, 'test', 'test')")
            .params(alert, disposition).update()
    }

    private fun suggest(reason: String, id: Long = alertId) =
        mvc.post().uri("/api/alerts/$id/suggestion").contentType(MediaType.APPLICATION_JSON).content("""{"reason":"$reason"}""")

    private fun count(table: String) = jdbc.sql("select count(*) from $table").query(Long::class.java).single()

    private val ruleExplanation = """"ruleExplanation":"Flags money passed on within hours of arriving, for this client only.""""

    private val explanation = """"explanation":[{"text":"The reviewer says it is payroll.","refs":["reason","rule:C1"]}]"""

    private val threshold = """{"kind":"rule_version","ruleKey":"C1","layer":"client","condition":null,"variables":[],
        "params":[{"name":"min_inflow","value":200000,"unit":null}],$explanation,$ruleExplanation}"""

    private val version = """{"kind":"rule_version","ruleKey":"C1","layer":"client",
        "condition":"inflow > p.min_inflow && outflow * 100.0 >= p.forward_pct * inflow && inflow > 0.0","variables":[],"params":[],$explanation,$ruleExplanation}"""

    @Test
    fun returnsAClientThreshold() {
        bedrock.reply = threshold

        val body = assertThat(suggest("Monthly payroll pass-through")).hasStatusOk().bodyJson()
        body.extractingPath("$.kind").isEqualTo("rule_version")
        body.extractingPath("$.rule.key").isEqualTo("C1-K2")
        body.extractingPath("$.rule.scopeClientId").isEqualTo("K2")
        body.extractingPath("$.rule.replacesKey").isEqualTo("C1")
        body.extractingPath("$.rule.params.min_inflow.value").isEqualTo(200000.0)
        body.extractingPath("$.rule.params.min_inflow.unit").isEqualTo("amount")
        body.extractingPath("$.previousParams.min_inflow.value").isEqualTo(100000.0)
        body.extractingPath("$.ruleExplanation").asString().startsWith("Flags")
        body.extractingPath("$.impact.stopsThisAlert").isEqualTo(true)
        body.extractingPath("$.impact.client.alertsClosed").isEqualTo(1)
        body.extractingPath("$.impact.company").isNull()
        body.extractingPath("$.declined").isNull()
        body.extractingPath("$.promptHash").asString().hasSize(12)
        assertThat(bedrock.prompt).contains("\"ref\":\"reason\"", "Monthly payroll pass-through", "\"min_inflow\"", "\"vocabulary\"", "\"values\"", "\"ref\":\"client\"", "\"existingRules\"")
    }

    @Test
    fun returnsARuleVersion() {
        bedrock.reply = version

        val body = assertThat(suggest("Payroll only")).hasStatusOk().bodyJson()
        body.extractingPath("$.rule.key").isEqualTo("C1-K2")
        body.extractingPath("$.rule.params.forward_pct.value").isEqualTo(80.0)
        body.extractingPath("$.rule.variables[0].window.kind").isEqualTo("relative")
        body.extractingPath("$.rule.variables").asList().hasSize(3)
    }

    @Test
    fun returnsNone() {
        bedrock.reply = """{"kind":"none","ruleKey":"C1","layer":"client","condition":null,"variables":[],"params":[],$explanation,"ruleExplanation":null}"""
        assertThat(suggest("Not enough to change anything")).hasStatusOk().bodyJson().extractingPath("$.kind").isEqualTo("none")
    }

    @Test
    fun writesNothing() {
        bedrock.reply = version
        val rules = count("rule")
        val params = count("rule_param")

        assertThat(suggest("Payroll only")).hasStatusOk()

        assertThat(count("rule")).isEqualTo(rules)
        assertThat(count("rule_param")).isEqualTo(params)
    }

    @Test
    fun declinesAChangeThatClosesAHighAlert() {
        triage(otherAlertId, "REVIEW_HIGH")
        bedrock.reply = threshold

        val body = assertThat(suggest("Monthly payroll pass-through")).hasStatusOk().bodyJson()
        body.extractingPath("$.kind").isEqualTo("none")
        body.extractingPath("$.declined").asString().contains("high")
        body.extractingPath("$.impact.client.closedByDisposition.REVIEW_HIGH").isEqualTo(1)
        body.extractingPath("$.rule.key").isEqualTo("C1-K2")
    }

    @Test
    fun suggestsWhenThisAlertHoldsSeveralHitsOfTheRule() {
        // Like a per-client alert type: every hit of the client sits in this one alert, and no other alert exists.
        jdbc.sql("update alert_hit set alert_id = ? where alert_id = ?").params(alertId, otherAlertId).update()
        jdbc.sql("delete from alert where id = ?").param(otherAlertId).update()
        bedrock.reply = threshold

        val body = assertThat(suggest("Monthly payroll pass-through")).hasStatusOk().bodyJson()
        body.extractingPath("$.kind").isEqualTo("rule_version")
        body.extractingPath("$.impact.client.hitsStopped").isEqualTo(2)
        body.extractingPath("$.impact.closesThisAlert").isEqualTo(true)
    }

    @Test
    fun declinesAChangeThatStopsOnlyThisAlert() {
        val hits = jdbc.sql("select hit_id from alert_hit where alert_id = ?").param(otherAlertId).query(Long::class.java).list()
        jdbc.sql("delete from alert_hit where alert_id = ?").param(otherAlertId).update()
        jdbc.sql("delete from rule_hit where id = any(?)").param(hits.toTypedArray()).update()
        bedrock.reply = threshold

        val body = assertThat(suggest("Monthly payroll pass-through")).hasStatusOk().bodyJson()
        body.extractingPath("$.kind").isEqualTo("none")
        body.extractingPath("$.declined").asString().contains("stop only 1 hit")
    }

    @Test
    fun rejectsABlankReason() {
        assertThat(suggest("  ")).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(bedrock.prompt).isEmpty()
    }

    @Test
    fun rejectsAnOverlongReason() {
        assertThat(suggest("x".repeat(2001))).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(bedrock.prompt).isEmpty()
    }

    @Test
    fun unknownAlertIs404() {
        assertThat(suggest("Payroll", -1)).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun failedCheckIs502() {
        bedrock.reply = threshold.replace("\"ruleKey\":\"C1\"", "\"ruleKey\":\"B1\"")
        assertThat(suggest("Payroll")).hasStatus(HttpStatus.BAD_GATEWAY).bodyJson().extractingPath("$.detail").asString().contains("B1")
    }
}
