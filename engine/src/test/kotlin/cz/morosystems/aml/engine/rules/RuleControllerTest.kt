package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.bedrock.BedrockException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.assertj.MockMvcTester

@TestConfiguration(proxyBeanMethods = false)
class FakeTextBedrockConfig {
    @Bean
    @Primary
    fun fakeTextBedrock() = FakeTextBedrock()
}

@PostgresTest
@AutoConfigureMockMvc
@Import(FakeTextBedrockConfig::class)
class RuleControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    @Autowired
    lateinit var bedrock: FakeTextBedrock

    @Autowired
    lateinit var controller: RuleController

    @BeforeEach
    fun seededOnly() {
        jdbc.resetRules()
        bedrock.failure = null
        bedrock.reply = LOWER_B2
    }

    @Test
    fun listsTheSeededVersions() {
        val list = assertThat(mvc.get().uri("/api/rules")).hasStatusOk().bodyJson()
        list.extractingPath("$.length()").isEqualTo(7)
        list.extractingPath("$[4].key").isEqualTo("B2")
        list.extractingPath("$[4].params.pep_min.value").isEqualTo(10_000_000)
        list.extractingPath("$[4].params.pep_min.unit").isEqualTo("amount")
        list.extractingPath("$[0].params.projected_pct.unit").isEqualTo("percent")
        list.extractingPath("$[4].name").isEqualTo("PEP outgoing payment above the limit")
        list.extractingPath("$[4].grain").isEqualTo("transaction")
        list.extractingPath("$[4].layer").isEqualTo("company")
        list.extractingPath("$[5].variables[0].window.kind").isEqualTo("relative")
        list.extractingPath("$[5].variables[0].window.from").isEqualTo("PT-24H")
        list.extractingPath("$[0].variables[0].window.kind").isEqualTo("day")
    }

    @Test
    fun savesADraftWithItsExplanation() {
        val saved = assertThat(post(b2Body(pepMin = 5_000_000))).hasStatus(HttpStatus.CREATED).bodyJson()
        saved.extractingPath("$.version").isEqualTo(2)
        saved.extractingPath("$.status").isEqualTo("draft")
        saved.extractingPath("$.author").isEqualTo("J. Novák")
        saved.extractingPath("$.params.pep_min").isEqualTo(mapOf("value" to 5_000_000, "unit" to "amount"))
        saved.extractingPath("$.explanation").isEqualTo(LOWER_B2)
        saved.extractingPath("$.explanationModel").isEqualTo("eu.anthropic.claude-opus-4-5-20251101-v1:0")
    }

    @Test
    fun aSecondSaveIsTheNextVersion() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED).bodyJson().extractingPath("$.version").isEqualTo(2)
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED).bodyJson().extractingPath("$.version").isEqualTo(3)
    }

    @Test
    fun savesVariablesWithTheirWindows() {
        val saved = assertThat(post(C9_BODY)).hasStatus(HttpStatus.CREATED).bodyJson()
        saved.extractingPath("$.variables[2].window.to").isEqualTo("PT6H")
        saved.extractingPath("$.anchor").isEqualTo("tx.direction == \"in\"")
    }

    @Test
    fun bedrockFailureStillSaves() {
        bedrock.failure = BedrockException("The SSO session has expired")
        val saved = assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED).bodyJson()
        saved.extractingPath("$.explanation").isNull()
        assertThat(mvc.get().uri("/api/rules")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(8)
    }

    @Test
    fun rejectsACelError() {
        val body = b2Body().replace("tx.direction in", "tx.direcion in")
        assertThat(post(body)).hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.detail").asString().contains("direcion")
        assertThat(mvc.get().uri("/api/rules")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(7)
    }

    @Test
    fun rejectsAConditionUsingAMissingParameter() {
        assertThat(post(b2Body().replace(""""pep_min": { "value": 5000000, "unit": "amount" }""", ""))).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun rejectsChangingTheAlertTypeOfAnExistingKey() {
        assertThat(post(b2Body().replace(""""alertType": "B"""", """"alertType": "A"""")))
            .hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.detail").asString().contains("alert type")
    }

    @Test
    fun rejectsASegmentRuleWithoutASegment() {
        val body = b2Body(key = "B7").replace(""""layer": "company"""", """"layer": "segment"""")
        assertThat(post(body)).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun rejectsAnUnknownAlertType() {
        assertThat(post(b2Body(key = "X1").replace(""""alertType": "B"""", """"alertType": "Q"""")))
            .hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.detail").asString().contains("alert type Q")
    }

    @Test
    fun rejectsAParameterWithoutAValue() {
        assertThat(post(b2Body().replace(""""value": 5000000""", """"value": null""")))
            .hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.detail").asString().contains("pep_min")
    }

    @Test
    fun rejectsAParameterWithAnUnknownUnit() {
        assertThat(post(b2Body(unit = "euros")))
            .hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.detail").asString().contains("unknown unit 'euros'")
    }

    @Test
    fun rejectsAParameterWithoutAUnit() {
        assertThat(post(b2Body().replace(""", "unit": "amount"""", "")))
            .hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.detail").asString().contains("pep_min")
    }

    @Test
    fun rejectsAnUnreadableBody() {
        assertThat(post("""{"key": "B2"}""")).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun concurrentSaveOfTheSameVersionIs409() {
        val problem = controller.conflict(DuplicateKeyException("duplicate key value violates unique constraint \"rule_key_version_key\""))
        assertThat(problem.status).isEqualTo(409)
        assertThat(problem.detail).contains("try again")
    }

    @Test
    fun unknownIdIs404() {
        assertThat(mvc.get().uri("/api/rules/999999")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun findsOneVersion() {
        val id = jdbc.sql("select id from rule where key = 'C1' and version = 1").query(Long::class.java).single()
        assertThat(mvc.get().uri("/api/rules/$id")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("retired")
    }

    private fun post(body: String) = mvc.post().uri("/api/rules").contentType(MediaType.APPLICATION_JSON).content(body)

    private fun b2Body(pepMin: Long = 5_000_000, key: String = "B2", unit: String = "amount") = """
        {
          "key": "$key", "alertType": "B", "layer": "company", "scopeSegmentId": null, "scopeClientId": null,
          "grain": "transaction", "anchor": null,
          "condition": "client.pep && tx.amount > p.pep_min && tx.direction in [\"out\", \"unknown\"]",
          "replacesKey": null, "variables": [], "params": { "pep_min": { "value": $pepMin, "unit": "$unit" } }, "author": "J. Novák"
        }
    """.trimIndent()

    private companion object {
        const val LOWER_B2 = "Flags outgoing or unknown-direction transactions of more than 50,000 CZK when the client is a politically exposed person."

        val C9_BODY = """
            {
              "key": "C9", "alertType": "C", "layer": "company", "scopeSegmentId": null, "scopeClientId": null,
              "grain": "client_anchor", "anchor": "tx.direction == \"in\"",
              "condition": "inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow",
              "replacesKey": null,
              "variables": [
                { "name": "inflow", "agg": "sum", "field": "amount", "filter": "tx.direction == \"in\"",
                  "window": { "kind": "relative", "from": "PT-24H", "to": "PT0S" } },
                { "name": "payers", "agg": "set", "field": "payer_account", "filter": "tx.direction == \"in\"",
                  "window": { "kind": "relative", "from": "PT-24H", "to": "PT0S" } },
                { "name": "outflow", "agg": "sum", "field": "amount", "filter": "tx.direction == \"out\" && !(tx.payee_account in payers)",
                  "window": { "kind": "relative", "from": "PT0S", "to": "PT6H" } }
              ],
              "params": { "min_inflow": { "value": 10000000, "unit": "amount" }, "forward_pct": { "value": 80, "unit": "percent" } },
              "author": "J. Novák"
            }
        """.trimIndent()
    }
}
