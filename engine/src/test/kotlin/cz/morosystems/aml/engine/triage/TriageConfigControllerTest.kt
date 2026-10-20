package cz.morosystems.aml.engine.triage

import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.assertj.MockMvcTester

/**
 * The triage policy over HTTP. These tests commit, so the seeded version 1 is restored as the only active version
 * before and after each one — the Postgres container is shared with every other test in this context.
 */
@PostgresTest
@AutoConfigureMockMvc
class TriageConfigControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    @Autowired
    lateinit var controller: TriageConfigController

    @BeforeEach
    fun seededOnly() = resetTriageConfig()

    @AfterEach
    fun seededAgain() = resetTriageConfig()

    @Test
    fun listsTheSeededVersion() {
        val list = assertThat(mvc.get().uri("/api/triage/configs")).hasStatusOk().bodyJson()
        list.extractingPath("$.length()").isEqualTo(1)
        list.extractingPath("$[0].version").isEqualTo(1)
        list.extractingPath("$[0].configVersion").isEqualTo("triage-v1")
        list.extractingPath("$[0].status").isEqualTo("active")
        list.extractingPath("$[0].author").isEqualTo("finreg-brief")
    }

    @Test
    fun servesTheActiveVersionWithItsPayloadAndItsRuleScores() {
        val active = assertThat(mvc.get().uri("/api/triage/config")).hasStatusOk().bodyJson()
        active.extractingPath("$.version").isEqualTo(1)
        active.extractingPath("$.payload.unknownRuleScore").isEqualTo(70)
        active.extractingPath("$.rules.length()").isEqualTo(6)
        active.extractingPath("$.rules[0].ruleKey").isEqualTo("A1")
        active.extractingPath("$.rules[0].baseScore").isEqualTo(8)
        active.extractingPath("$.rules[0].autoCloseable").isEqualTo(true)
        active.extractingPath("$.rules[4].ruleKey").isEqualTo("B2")
        active.extractingPath("$.rules[4].impliesPep").isEqualTo(true)
    }

    @Test
    fun servesOneVersionByItsNumber() {
        assertThat(mvc.get().uri("/api/triage/config/1")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("active")
    }

    @Test
    fun anUnknownVersionIs404() {
        assertThat(mvc.get().uri("/api/triage/config/999")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun savesTheNextDraftWithoutActivatingIt() {
        val saved = assertThat(post(body())).hasStatus(HttpStatus.CREATED).bodyJson()
        saved.extractingPath("$.version").isEqualTo(2)
        saved.extractingPath("$.configVersion").isEqualTo("triage-v2")
        saved.extractingPath("$.status").isEqualTo("draft")
        saved.extractingPath("$.author").isEqualTo("J. Novák")

        assertThat(mvc.get().uri("/api/triage/config")).hasStatusOk().bodyJson().extractingPath("$.version").isEqualTo(1)
    }

    @Test
    fun aSecondSaveIsTheNextVersionAndTheBodyNeverCarriesOne() {
        assertThat(post(body())).hasStatus(HttpStatus.CREATED).bodyJson().extractingPath("$.version").isEqualTo(2)
        assertThat(post(body())).hasStatus(HttpStatus.CREATED).bodyJson().extractingPath("$.version").isEqualTo(3)
    }

    @Test
    fun aDraftCarriesTheRuleScoresItWasSentWith() {
        val rules = """[{"ruleKey": "A1", "baseScore": 9, "autoCloseable": false, "impliesPep": true}]"""
        val saved = assertThat(post(body(rules = rules))).hasStatus(HttpStatus.CREATED).bodyJson()
        saved.extractingPath("$.rules.length()").isEqualTo(1)
        saved.extractingPath("$.rules[0].baseScore").isEqualTo(9)
        saved.extractingPath("$.rules[0].autoCloseable").isEqualTo(false)
        saved.extractingPath("$.rules[0].impliesPep").isEqualTo(true)
    }

    @Test
    fun activatingAVersionRetiresTheOneThatWasActive() {
        assertThat(post(body())).hasStatus(HttpStatus.CREATED)

        val promoted = assertThat(mvc.post().uri("/api/triage/config/2/activate")).hasStatusOk().bodyJson()
        promoted.extractingPath("$.version").isEqualTo(2)
        promoted.extractingPath("$.status").isEqualTo("active")

        assertThat(mvc.get().uri("/api/triage/config/1")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("retired")
    }

    @Test
    fun activatingAVersionThatIsNotThereIs400() {
        assertThat(mvc.post().uri("/api/triage/config/999/activate")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("999")
    }

    @Test
    fun aBandThresholdThatDoesNotIncreaseIs400WithTheReasonVerbatim() {
        val broken = PAYLOAD.replace(""""maxScore": 44""", """"maxScore": 24""")
        assertThat(post(body(payload = broken))).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("band thresholds must strictly increase: [24, 24, 64, 84, 100]")
    }

    @Test
    fun aRejectedDraftStoresNothing() {
        assertThat(post(body(payload = PAYLOAD.replace(""""bands"""", """"bandz"""")))).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(mvc.get().uri("/api/triage/configs")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(1)
    }

    @Test
    fun aBaseScoreOutsideTheRangeIs400() {
        val rules = """[{"ruleKey": "A1", "baseScore": 101}]"""
        assertThat(post(body(rules = rules))).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("base score")
    }

    @Test
    fun aRuleScoredTwiceIs400() {
        val rules = """[{"ruleKey": "A1", "baseScore": 8}, {"ruleKey": "A1", "baseScore": 9}]"""
        assertThat(post(body(rules = rules))).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("A1 is scored twice")
    }

    @Test
    fun aDraftWithoutAnAuthorIs400() {
        assertThat(post(body(author = " "))).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("author")
    }

    @Test
    fun anUnreadableBodyIs400() {
        assertThat(post("""{"author": "J. Novák"}""")).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun coverageNamesTheRulesTheActiveConfigDoesNotScore() {
        val coverage = assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson()
        coverage.extractingPath("$.unscored.length()").isEqualTo(0)
        coverage.extractingPath("$.orphaned.length()").isEqualTo(0)
    }

    @Test
    fun coverageFlagsAScoreNoLiveRuleUses() {
        val rules = """[{"ruleKey": "A1", "baseScore": 8}, {"ruleKey": "Z9", "baseScore": 50}]"""
        assertThat(post(body(rules = rules))).hasStatus(HttpStatus.CREATED)
        assertThat(mvc.post().uri("/api/triage/config/2/activate")).hasStatusOk()

        val coverage = assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson()
        coverage.extractingPath("$.unscored").isEqualTo(listOf("A2", "A3", "B1", "B2", "C1"))
        coverage.extractingPath("$.orphaned").isEqualTo(listOf("Z9"))
    }

    @Test
    fun patchingARuleScoreCreatesTheNextVersionAndActivatesIt() {
        val patched = assertThat(patchRule("A1", """{"author": "J. Novák", "baseScore": 30, "autoCloseable": false, "impliesPep": true}"""))
            .hasStatusOk().bodyJson()
        patched.extractingPath("$.version").isEqualTo(2)
        patched.extractingPath("$.status").isEqualTo("active")
        patched.extractingPath("$.author").isEqualTo("J. Novák")
        patched.extractingPath("$.rules[0].ruleKey").isEqualTo("A1")
        patched.extractingPath("$.rules[0].baseScore").isEqualTo(30)
        patched.extractingPath("$.rules[0].impliesPep").isEqualTo(true)
        // The rest of the policy travelled with the copy, untouched.
        patched.extractingPath("$.rules.length()").isEqualTo(6)
        patched.extractingPath("$.payload.unknownRuleScore").isEqualTo(70)

        // Insert-only: version 1 is still stored and still says what it said.
        val previous = assertThat(mvc.get().uri("/api/triage/config/1")).hasStatusOk().bodyJson()
        previous.extractingPath("$.status").isEqualTo("retired")
        previous.extractingPath("$.rules[0].baseScore").isEqualTo(8)
    }

    @Test
    fun patchingARuleTheActiveConfigDoesNotScoreAddsIt() {
        assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson().extractingPath("$.orphaned.length()").isEqualTo(0)

        val patched = assertThat(patchRule("Z9", """{"author": "J. Novák", "baseScore": 50}""")).hasStatusOk().bodyJson()
        patched.extractingPath("$.rules.length()").isEqualTo(7)
        patched.extractingPath("$.rules[6].ruleKey").isEqualTo("Z9")
        patched.extractingPath("$.rules[6].baseScore").isEqualTo(50)

        assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson().extractingPath("$.orphaned").isEqualTo(listOf("Z9"))
    }

    @Test
    fun patchingTheFactorsChangesOnlyWhatItNames() {
        val patched = assertThat(patchFactors("""{"author": "J. Novák", "unknownRuleScore": 55, "pep": 21}""")).hasStatusOk().bodyJson()
        patched.extractingPath("$.version").isEqualTo(2)
        patched.extractingPath("$.status").isEqualTo("active")
        patched.extractingPath("$.payload.unknownRuleScore").isEqualTo(55)
        patched.extractingPath("$.payload.factors.pep").isEqualTo(21)
        patched.extractingPath("$.payload.factors.staticCap").isEqualTo(25)
        patched.extractingPath("$.payload.perExtraRule").isEqualTo(3)
        patched.extractingPath("$.payload.bands.length()").isEqualTo(5)
        patched.extractingPath("$.rules.length()").isEqualTo(6)
    }

    @Test
    fun aPatchThatWouldProduceAnInvalidConfigRollsBack() {
        assertThat(patchFactors("""{"author": "J. Novák", "unknownRuleScore": 101}""")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("unknownRuleScore")

        // Nothing half-applied: no new version, and the one that was active still is.
        assertThat(mvc.get().uri("/api/triage/configs")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(1)
        val active = assertThat(mvc.get().uri("/api/triage/config")).hasStatusOk().bodyJson()
        active.extractingPath("$.version").isEqualTo(1)
        active.extractingPath("$.payload.unknownRuleScore").isEqualTo(70)
    }

    @Test
    fun aPatchWithoutAnAuthorIs400() {
        assertThat(patchRule("A1", """{"author": " ", "baseScore": 30}""")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("author")
        assertThat(patchFactors("""{"author": " ", "pep": 20}""")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("author")
    }

    @Test
    fun aRuleBaseScoreOutsideTheRangeIsRejectedByThePatchToo() {
        assertThat(patchRule("A1", """{"author": "J. Novák", "baseScore": 101}""")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("base score")
        assertThat(mvc.get().uri("/api/triage/configs")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(1)
    }

    @Test
    fun concurrentSaveOfTheSameVersionIs409() {
        val problem = controller.conflict(DuplicateKeyException("duplicate key value violates unique constraint \"triage_config_version_key\""))
        assertThat(problem.status).isEqualTo(409)
        assertThat(problem.detail).contains("try again")
    }

    private fun resetTriageConfig() {
        val children = listOf(
            "triage_floor", "triage_required_field", "triage_band", "triage_intensity_band",
            "triage_amount_band", "triage_channel_point", "triage_risk_point", "triage_rule",
        )
        children.forEach { jdbc.sql("delete from $it where config_id in (select id from triage_config where version > 1)").update() }
        jdbc.sql("delete from triage_config where version > 1").update()
        jdbc.sql("update triage_config set status = 'active' where version = 1").update()
    }

    private fun post(body: String) = mvc.post().uri("/api/triage/config").contentType(MediaType.APPLICATION_JSON).content(body)

    private fun patchRule(ruleKey: String, body: String) =
        mvc.patch().uri("/api/triage/config/rules/$ruleKey").contentType(MediaType.APPLICATION_JSON).content(body)

    private fun patchFactors(body: String) =
        mvc.patch().uri("/api/triage/config/factors").contentType(MediaType.APPLICATION_JSON).content(body)

    private fun body(
        author: String = "J. Novák",
        payload: String = PAYLOAD,
        rules: String = SEEDED_RULES_JSON,
    ) = """{ "author": "$author", "payload": $payload, "rules": $rules }"""

    private companion object {
        /** The rule-agnostic policy the migration seeds version 1 with, as the API takes it. */
        val PAYLOAD = """
            {
              "unknownRuleScore": 70,
              "perExtraRule": 3,
              "extraRuleMax": 6,
              "factors": {
                "riskPoints": { "low": 0, "medium": 10, "high": 20 },
                "pep": 15,
                "highRiskCountry": 10,
                "staticCap": 25,
                "channelPoints": { "in person": 0, "distant form": 5 },
                "unbaselinedClient": 10,
                "tenureUnder90Days": 10,
                "tenureUnder365Days": 5,
                "perExtraAlertType": 10,
                "extraAlertTypeMax": 20
              },
              "amountBands": [
                { "from": 1000000, "points": 15 },
                { "from": 250000, "points": 8 },
                { "from": 50000, "points": 3 }
              ],
              "intensityBands": {
                "A": [{ "fromHits": 60, "points": 10 }, { "fromHits": 45, "points": 5 }],
                "C": [{ "fromHits": 3, "points": 10 }, { "fromHits": 2, "points": 5 }]
              },
              "bands": [
                { "maxScore": 24, "disposition": "AUTO_CLOSE" },
                { "maxScore": 44, "disposition": "REVIEW_LOW" },
                { "maxScore": 64, "disposition": "REVIEW_MEDIUM" },
                { "maxScore": 84, "disposition": "REVIEW_HIGH" },
                { "maxScore": 100, "disposition": "ESCALATE" }
              ],
              "requiredFields": ["client.risk", "client.country", "client.expected_monthly_volume", "alert.amount"],
              "floors": [
                { "condition": "UNKNOWN_RULE", "alertType": null, "minDisposition": "REVIEW_HIGH" },
                { "condition": "PEP_AND_HIGH_RISK_COUNTRY", "alertType": null, "minDisposition": "REVIEW_HIGH" },
                { "condition": "ALERT_TYPE", "alertType": "B", "minDisposition": "REVIEW_MEDIUM" },
                { "condition": "ALERT_TYPE", "alertType": "C", "minDisposition": "REVIEW_MEDIUM" },
                { "condition": "CLIENT_UNBASELINED", "alertType": null, "minDisposition": "REVIEW_LOW" }
              ],
              "highRiskCountries": []
            }
        """.trimIndent()

        val SEEDED_RULES_JSON = TriageConfigTest.SEEDED_RULES.entries.joinToString(", ", "[", "]") { (key, triage) ->
            """{"ruleKey": "$key", "baseScore": ${triage.baseScore}, "autoCloseable": ${triage.autoCloseable}, "impliesPep": ${triage.impliesPep}}"""
        }
    }
}
