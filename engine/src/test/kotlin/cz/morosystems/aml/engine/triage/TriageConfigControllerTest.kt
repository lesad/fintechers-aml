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

        val promoted = assertThat(activate(2)).hasStatusOk().bodyJson()
        promoted.extractingPath("$.version").isEqualTo(2)
        promoted.extractingPath("$.status").isEqualTo("active")

        assertThat(mvc.get().uri("/api/triage/config/1")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("retired")
    }

    @Test
    fun onlyAComplianceOfficerWhoDidNotWriteItActivatesAVersion() {
        assertThat(post(body())).hasStatus(HttpStatus.CREATED)
        assertThat(activate(2, user = null)).hasStatus(HttpStatus.FORBIDDEN)
        assertThat(activate(2, user = userId("ANALYST"))).hasStatus(HttpStatus.FORBIDDEN)
        assertThat(activate(2, user = userId("COMPLIANCE_MANAGER"))).hasStatus(HttpStatus.FORBIDDEN)
        assertThat(post(body(author = "M. Svobodová"))).hasStatus(HttpStatus.CREATED)
        assertThat(activate(3)).hasStatus(HttpStatus.FORBIDDEN)
            .bodyJson().extractingPath("$.detail").asString().contains("wrote this version")
    }

    @Test
    fun activatingAVersionThatIsNotThereIs400() {
        assertThat(activate(999)).hasStatus(HttpStatus.BAD_REQUEST)
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
        assertThat(activate(2)).hasStatusOk()

        val coverage = assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson()
        coverage.extractingPath("$.unscored").isEqualTo(listOf("A2", "A3", "B1", "B2", "C1"))
        coverage.extractingPath("$.orphaned").isEqualTo(listOf("Z9"))
    }

    @Test
    fun proposingARescoreWritesADraftAndLeavesTheActiveVersionAlone() {
        val draft = assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 30, "impliesPep": true}]""")).hasStatusOk().bodyJson()
        draft.extractingPath("$.version").isEqualTo(2)
        draft.extractingPath("$.status").isEqualTo("draft")
        draft.extractingPath("$.author").isEqualTo("J. Novák")
        draft.extractingPath("$.rules[0].ruleKey").isEqualTo("A1")
        draft.extractingPath("$.rules[0].baseScore").isEqualTo(30)
        draft.extractingPath("$.rules[0].impliesPep").isEqualTo(true)
        // The rest of the policy travelled with the copy, untouched.
        draft.extractingPath("$.rules.length()").isEqualTo(6)
        draft.extractingPath("$.payload.unknownRuleScore").isEqualTo(70)

        // Triage still runs under version 1, which still says what it said.
        val active = assertThat(mvc.get().uri("/api/triage/config")).hasStatusOk().bodyJson()
        active.extractingPath("$.version").isEqualTo(1)
        active.extractingPath("$.rules[0].baseScore").isEqualTo(8)
    }

    @Test
    fun asecondProposalStacksOntoTheSameDraft() {
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()
        val draft = assertThat(propose(rules = """[{"ruleKey": "B1", "baseScore": 55}]""")).hasStatusOk().bodyJson()
        draft.extractingPath("$.version").isEqualTo(2)
        draft.extractingPath("$.rules[0].baseScore").isEqualTo(30)
        draft.extractingPath("$.rules[3].ruleKey").isEqualTo("B1")
        draft.extractingPath("$.rules[3].baseScore").isEqualTo(55)
        assertThat(mvc.get().uri("/api/triage/configs")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(2)
    }

    @Test
    fun theOpenDraftIsServedOnItsOwnAndIsGoneOnceApproved() {
        assertThat(mvc.get().uri("/api/triage/config/open")).hasStatus(HttpStatus.NOT_FOUND)
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()
        assertThat(mvc.get().uri("/api/triage/config/open")).hasStatusOk().bodyJson().extractingPath("$.version").isEqualTo(2)

        assertThat(submit(2)).hasStatusOk()
        assertThat(approve(2)).hasStatusOk()
        assertThat(mvc.get().uri("/api/triage/config/open")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun proposingARuleTheActiveConfigDoesNotScoreAddsIt() {
        assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson().extractingPath("$.orphaned.length()").isEqualTo(0)

        val draft = assertThat(propose(rules = """[{"ruleKey": "Z9", "baseScore": 50}]""")).hasStatusOk().bodyJson()
        draft.extractingPath("$.rules.length()").isEqualTo(7)
        draft.extractingPath("$.rules[6].ruleKey").isEqualTo("Z9")

        // Coverage reads the active version, so a draft does not change it until it is approved.
        assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson().extractingPath("$.orphaned.length()").isEqualTo(0)
        assertThat(submit(2)).hasStatusOk()
        assertThat(approve(2)).hasStatusOk()
        assertThat(mvc.get().uri("/api/triage/coverage")).hasStatusOk().bodyJson().extractingPath("$.orphaned").isEqualTo(listOf("Z9"))
    }

    @Test
    fun proposingFactorsChangesOnlyWhatItNames() {
        val draft = assertThat(propose(factors = """{"unknownRuleScore": 55, "pep": 21}""")).hasStatusOk().bodyJson()
        draft.extractingPath("$.version").isEqualTo(2)
        draft.extractingPath("$.status").isEqualTo("draft")
        draft.extractingPath("$.payload.unknownRuleScore").isEqualTo(55)
        draft.extractingPath("$.payload.factors.pep").isEqualTo(21)
        draft.extractingPath("$.payload.factors.staticCap").isEqualTo(25)
        draft.extractingPath("$.payload.perExtraRule").isEqualTo(3)
        draft.extractingPath("$.payload.bands.length()").isEqualTo(5)
        draft.extractingPath("$.rules.length()").isEqualTo(6)
    }

    @Test
    fun aDraftIsSentToAnApproverWhoIsNeitherItsAuthorNorItsSender() {
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()

        val pending = assertThat(submit(2)).hasStatusOk().bodyJson()
        pending.extractingPath("$.status").isEqualTo("pending")
        pending.extractingPath("$.assignee").isEqualTo(name("COMPLIANCE_OFFICER"))

        // A pending version is no longer edited: the next change waits for it to be decided.
        assertThat(propose(rules = """[{"ruleKey": "B1", "baseScore": 55}]""")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("waiting for")
    }

    @Test
    fun aDraftCannotBeSentToItsOwnAuthor() {
        assertThat(propose(author = name("COMPLIANCE_OFFICER"), rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()
        assertThat(submit(2, approverId = userId("COMPLIANCE_OFFICER"))).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("needs an approver")
        // An analyst is too junior to approve one.
        assertThat(submit(2, approverId = userId("ANALYST"))).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun approvingThePendingVersionActivatesItAndRetiresTheOneThatWasActive() {
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()
        assertThat(submit(2)).hasStatusOk()

        val approved = assertThat(approve(2)).hasStatusOk().bodyJson()
        approved.extractingPath("$.status").isEqualTo("active")
        approved.extractingPath("$.approver").isEqualTo(name("COMPLIANCE_OFFICER"))
        approved.extractingPath("$.assignee").isEqualTo(null)

        assertThat(mvc.get().uri("/api/triage/config/1")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("retired")
        assertThat(mvc.get().uri("/api/triage/config")).hasStatusOk().bodyJson().extractingPath("$.rules[0].baseScore").isEqualTo(30)
    }

    @Test
    fun nobodyApprovesTheirOwnVersionAndAnAnalystApprovesNone() {
        assertThat(propose(author = name("COMPLIANCE_OFFICER"), rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()
        assertThat(submit(2, approverId = userId("COMPLIANCE_MANAGER"))).hasStatusOk()

        assertThat(approve(2)).hasStatus(HttpStatus.FORBIDDEN)
            .bodyJson().extractingPath("$.detail").asString().contains("wrote this version")
        assertThat(approve(2, user = userId("ANALYST"))).hasStatus(HttpStatus.FORBIDDEN)
        assertThat(approve(2, user = userId("COMPLIANCE_MANAGER"))).hasStatusOk()
    }

    @Test
    fun rejectingSendsThePendingVersionBackToDraft() {
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()
        assertThat(submit(2)).hasStatusOk()

        val rejected = assertThat(reject(2)).hasStatusOk().bodyJson()
        rejected.extractingPath("$.status").isEqualTo("draft")
        rejected.extractingPath("$.assignee").isEqualTo(null)
        // It is editable again, and triage still runs under version 1.
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 40}]""")).hasStatusOk()
            .bodyJson().extractingPath("$.version").isEqualTo(2)
        assertThat(mvc.get().uri("/api/triage/config")).hasStatusOk().bodyJson().extractingPath("$.version").isEqualTo(1)
    }

    @Test
    fun onlyADraftIsDeleted() {
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatusOk()
        assertThat(mvc.delete().uri("/api/triage/config/2")).hasStatus(HttpStatus.NO_CONTENT)
        assertThat(mvc.get().uri("/api/triage/configs")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(1)

        assertThat(mvc.delete().uri("/api/triage/config/1")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("only a draft")
        assertThat(mvc.delete().uri("/api/triage/config/999")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun aProposalThatWouldProduceAnInvalidConfigRollsBack() {
        assertThat(propose(factors = """{"unknownRuleScore": 101}""")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("unknownRuleScore")

        // Nothing half-applied: no new version, and the one that was active still is.
        assertThat(mvc.get().uri("/api/triage/configs")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(1)
        val active = assertThat(mvc.get().uri("/api/triage/config")).hasStatusOk().bodyJson()
        active.extractingPath("$.version").isEqualTo(1)
        active.extractingPath("$.payload.unknownRuleScore").isEqualTo(70)
    }

    @Test
    fun aProposalWithoutAnAuthorOrWithoutAChangeIs400() {
        assertThat(propose(author = " ", rules = """[{"ruleKey": "A1", "baseScore": 30}]""")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("author")
        assertThat(propose()).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("at least one")
    }

    @Test
    fun aRuleBaseScoreOutsideTheRangeIsRejectedByAProposalToo() {
        assertThat(propose(rules = """[{"ruleKey": "A1", "baseScore": 101}]""")).hasStatus(HttpStatus.BAD_REQUEST)
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

    /** Proposes a change as a draft. The author defaults to the analyst the UI signs a save with. */
    private fun propose(author: String = "J. Novák", rules: String = "[]", factors: String = "{}") =
        mvc.post().uri("/api/triage/config/draft").contentType(MediaType.APPLICATION_JSON)
            .content("""{ "author": "$author", "rules": $rules, "factors": $factors }""")

    private fun submit(version: Int, approverId: Long? = null) =
        mvc.post().uri("/api/triage/config/$version/submit").contentType(MediaType.APPLICATION_JSON)
            .content(if (approverId == null) "{}" else """{"approverId": $approverId}""")

    private fun approve(version: Int, user: Long = userId("COMPLIANCE_OFFICER")) =
        mvc.post().uri("/api/triage/config/$version/approve").header("X-User-Id", user.toString())

    private fun reject(version: Int, user: Long = userId("COMPLIANCE_OFFICER")) =
        mvc.post().uri("/api/triage/config/$version/reject").header("X-User-Id", user.toString())

    private fun activate(version: Int, user: Long? = userId("COMPLIANCE_OFFICER")) =
        mvc.post().uri("/api/triage/config/$version/activate").apply { if (user != null) header("X-User-Id", user.toString()) }

    private fun userId(role: String) =
        jdbc.sql("select min(id) from app_user where role = ?").param(role).query(Long::class.java).single()

    private fun name(role: String) =
        jdbc.sql("select name from app_user where id = ?").param(userId(role)).query(String::class.java).single()

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
