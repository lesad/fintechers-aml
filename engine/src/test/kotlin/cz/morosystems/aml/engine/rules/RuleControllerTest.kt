package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.bedrock.BedrockException
import cz.morosystems.aml.engine.run.RunService
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

    @Autowired
    lateinit var runs: RunService

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
        list.extractingPath("$[4].params.pep_min.value").isEqualTo(100_000.0)
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
    fun aVersionIsNotSavedWithoutSayingWhyItChanges() {
        assertThat(post(b2Body(changeReason = " "))).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("changeReason is required")
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(put(idOf("B2", 2), b2Body(changeReason = ""))).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun aFirstVersionChangesNothingSoNeedsNoReason() {
        assertThat(post(b2Body(key = "B9", changeReason = ""))).hasStatus(HttpStatus.CREATED)
            .bodyJson().extractingPath("$.changeReason").isNull()
    }

    @Test
    fun savesADraftWithItsExplanation() {
        val saved = assertThat(post(b2Body(pepMin = 50_000.0))).hasStatus(HttpStatus.CREATED).bodyJson()
        saved.extractingPath("$.version").isEqualTo(2)
        saved.extractingPath("$.status").isEqualTo("draft")
        saved.extractingPath("$.author").isEqualTo("J. Novák")
        saved.extractingPath("$.changeReason").isEqualTo("PEP payments under 50k were missed")
        saved.extractingPath("$.params.pep_min").isEqualTo(mapOf("value" to 50_000.0, "unit" to "amount"))
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
        assertThat(post(b2Body().replace(""""pep_min": { "value": 50000.0, "unit": "amount" }""", ""))).hasStatus(HttpStatus.BAD_REQUEST)
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
        assertThat(post(b2Body().replace(""""value": 50000.0""", """"value": null""")))
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
    fun backtestsADraftStoresItApartAndPagesItsRows() {
        // A PEP: 150,000 CZK out trips B2 v1 (limit 100,000), 50,000 does not; v2 at 40,000 flags both.
        seedPepPayments()
        val draft = Regex("\"id\":(\\d+)").find(post(b2Body(pepMin = 40_000.0)).exchange().response.contentAsString)!!.groupValues[1]
        assertThat(mvc.get().uri("/api/rules/$draft/backtest")).hasStatus(HttpStatus.NOT_FOUND)

        val started = assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-07-01&to=2026-07-31")).hasStatus(HttpStatus.ACCEPTED).bodyJson()
        started.extractingPath("$.ruleKey").isEqualTo("B2")
        started.extractingPath("$.activeVersion").isEqualTo(1)
        started.extractingPath("$.status").isEqualTo("RUNNING")
        awaitBacktest(draft)
        val run = assertThat(mvc.get().uri("/api/rules/$draft/backtest")).hasStatusOk().bodyJson()
        run.extractingPath("$.status").isEqualTo("DONE")
        run.extractingPath("$.transactions").isEqualTo(2)
        run.extractingPath("$.newCount").isEqualTo(1)
        run.extractingPath("$.unchangedCount").isEqualTo(1)
        // No production run is left, and the result is kept apart.
        assertThat(count("run")).isZero()
        assertThat(count("backtest_row")).isEqualTo(2)

        val all = assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows?size=1")).hasStatusOk().bodyJson()
        all.extractingPath("$.total").isEqualTo(2)
        all.extractingPath("$.items[*].id").asArray().containsExactly("T2")
        assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows?size=1&page=1")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T1")
        assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows?view=new")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].change").asArray().containsExactly("NEW")
        // T2 is new because the draft itself hits it, in an alert of its own; T1 did not change, so it has no cause.
        val causes = assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows")).hasStatusOk().bodyJson()
        causes.extractingPath("$.items[*].byRule").asArray().containsExactly(true, false)
        causes.extractingPath("$.items[*].byTriage").asArray().containsExactly(false, false)
        assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows?view=sideways")).hasStatus(HttpStatus.BAD_REQUEST)
        // Changed holds rating changes only; T2 is new and T1 unchanged.
        assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows?view=changed")).hasStatusOk()
            .bodyJson().extractingPath("$.total").isEqualTo(0)

        // A new backtest replaces the old one; a week with no data replays nothing.
        assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-10-01&to=2026-10-07")).hasStatus(HttpStatus.ACCEPTED)
        awaitBacktest(draft)
        assertThat(mvc.get().uri("/api/rules/$draft/backtest")).hasStatusOk().bodyJson().extractingPath("$.transactions").isEqualTo(0)
        assertThat(count("backtest")).isEqualTo(1)
        assertThat(count("backtest_row")).isZero()

        // The runs cover all the data, but only the period's transactions are compared: 10 July holds T1 alone.
        assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-07-10&to=2026-07-10")).hasStatus(HttpStatus.ACCEPTED)
        awaitBacktest(draft)
        assertThat(mvc.get().uri("/api/rules/$draft/backtest")).hasStatusOk().bodyJson().extractingPath("$.transactions").isEqualTo(1)
        assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].id").asArray().containsExactly("T1")

        // Another draft's backtest deletes every stored one.
        val other = Regex("\"id\":(\\d+)").find(post(b2Body(key = "B9")).exchange().response.contentAsString)!!.groupValues[1]
        assertThat(mvc.post().uri("/api/rules/$other/backtest?from=2026-10-01&to=2026-10-07")).hasStatus(HttpStatus.ACCEPTED)
        awaitBacktest(other)
        assertThat(mvc.get().uri("/api/rules/$draft/backtest")).hasStatus(HttpStatus.NOT_FOUND)
        assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-10-01&to=2026-10-07")).hasStatus(HttpStatus.ACCEPTED)
        awaitBacktest(draft)

        val active = jdbc.sql("select id from rule where key = 'B2' and status = 'active'").query(Long::class.java).single()
        assertThat(mvc.post().uri("/api/rules/$active/backtest?from=2026-07-01&to=2026-07-31")).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-07-31&to=2026-07-01")).hasStatus(HttpStatus.BAD_REQUEST)

        // Deleting the draft takes its backtest along.
        assertThat(mvc.delete().uri("/api/rules/$draft")).hasStatus(HttpStatus.NO_CONTENT)
        assertThat(count("backtest")).isZero()
    }

    @Test
    fun anApprovedVersionLosesItsBacktestButAPendingOneKeepsIt() {
        val draft = Regex("\"id\":(\\d+)").find(post(b2Body(pepMin = 40_000.0)).exchange().response.contentAsString)!!.groupValues[1].toLong()
        assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-07-01&to=2026-07-31")).hasStatus(HttpStatus.ACCEPTED)
        awaitBacktest(draft)

        jdbc.sql("update rule set status = 'pending' where id = ?").param(draft).update()
        assertThat(count("backtest")).isEqualTo(1)
        jdbc.sql("update rule set status = 'approved', approved_at = now() where id = ?").param(draft).update()
        assertThat(count("backtest")).isZero()
    }

    @Test
    fun countsTheFalsePositivesADraftNoLongerFlags() {
        // T1 (150,000 CZK) was flagged by B2 v1 and closed as a false positive; v2 at 200,000 lets it through.
        seedPepPayments()
        runs.run(export = false)
        jdbc.sql("update alert set status = 'FALSE_POSITIVE' where transaction_id = 'T1'").update()
        val draft = Regex("\"id\":(\\d+)").find(post(b2Body(pepMin = 200_000.0)).exchange().response.contentAsString)!!.groupValues[1]

        assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-07-01&to=2026-07-31")).hasStatus(HttpStatus.ACCEPTED)
        awaitBacktest(draft)
        val bt = assertThat(mvc.get().uri("/api/rules/$draft/backtest")).hasStatusOk().bodyJson()
        bt.extractingPath("$.falsePositives").isEqualTo(1)
        bt.extractingPath("$.falsePositivesCleared").isEqualTo(1)
        bt.extractingPath("$.droppedCount").isEqualTo(1)
        // Dropped by the rule itself: B2 v1 hit T1, v2 no longer does.
        assertThat(mvc.get().uri("/api/rules/$draft/backtest/rows?view=dropped")).hasStatusOk()
            .bodyJson().extractingPath("$.items[*].byRule").asArray().containsExactly(true)
    }

    @Test
    fun countsTheReportedCasesADraftWouldLetThrough() {
        // T1 (150,000 CZK) was flagged by B2 v1 and reported; v2 at 200,000 lets it through: a false negative.
        seedPepPayments()
        runs.run(export = false)
        jdbc.sql("update alert set status = 'REPORTED' where transaction_id = 'T1'").update()
        val draft = Regex("\"id\":(\\d+)").find(post(b2Body(pepMin = 200_000.0)).exchange().response.contentAsString)!!.groupValues[1]

        assertThat(mvc.post().uri("/api/rules/$draft/backtest?from=2026-07-01&to=2026-07-31")).hasStatus(HttpStatus.ACCEPTED)
        awaitBacktest(draft)
        val bt = assertThat(mvc.get().uri("/api/rules/$draft/backtest")).hasStatusOk().bodyJson()
        bt.extractingPath("$.reported").isEqualTo(1)
        bt.extractingPath("$.falseNegatives").isEqualTo(1)
        bt.extractingPath("$.falsePositives").isEqualTo(0)
    }

    /** A PEP client with two outgoing payments in July: T1 for 150,000 CZK and T2 for 50,000 CZK. */
    private fun seedPepPayments() {
        jdbc.sql("truncate run, transaction, client cascade").update()
        jdbc.sql(
            """
            insert into client (id, country, contract_date, pep, type, channel, risk, expected_monthly_volume, q2_volume, q2_tx_count, q2_max_tx, q2_days)
            values ('K1', 'CZ', '2026-06-01', true, 'legal entity', 'in person', 'low', 100000000, 0, 0, 0, 91)
            """,
        ).update()
        for ((id, ts, amount) in listOf(Triple("T1", "2026-07-10 09:00", 150_000), Triple("T2", "2026-07-11 09:00", 50_000))) {
            jdbc.sql(
                """
                insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country, payer_account, payee_account, type, direction)
                values (?, 'K1', ?::timestamp, ?, ?, 'CZK', 1, 'CZ', 'CZ', 'K1', 'ACZ9', 'outgoing payment', 'out')
                """,
            ).params(id, ts, amount, amount).update()
        }
    }

    private fun count(table: String) = jdbc.sql("select count(*) from $table").query(Long::class.java).single()

    /** Waits for the latest recalculation of [rule], which runs in the background, to end; returns its stage. */
    private fun awaitRecalculation(rule: String): String {
        val stage = {
            jdbc.sql("select stage from import_job where rule = ? order by id desc limit 1").param(rule).query(String::class.java).single()
        }
        repeat(300) { stage().takeIf { it == "DONE" || it == "FAILED" }?.let { return it } ?: Thread.sleep(100) }
        error("recalculation of $rule still running")
    }

    /** Waits for the draft's backtest, which runs in the background, to leave RUNNING. */
    private fun awaitBacktest(draft: Any) {
        val status = { jdbc.sql("select status from backtest where rule_id = ?").param(draft.toString().toLong()).query(String::class.java).single() }
        repeat(300) { if (status() != "RUNNING") return else Thread.sleep(100) }
        error("backtest of $draft still running")
    }

    @Test
    fun unknownIdIs404() {
        assertThat(mvc.get().uri("/api/rules/999999")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun listsTheVocabularyWithTheValuesOfTextFields() {
        val vocabulary = assertThat(mvc.get().uri("/api/rules/vocabulary")).hasStatusOk().bodyJson()
        vocabulary.extractingPath("$.tx.amount").isEqualTo("double")
        vocabulary.extractingPath("$.client.pep").isEqualTo("bool")
        vocabulary.extractingPath("$.day.month").isEqualTo("int")
        vocabulary.extractingPath("$.lists.high_risk").asString().startsWith("list")
        vocabulary.extractingPath("$.values").asMap().containsKeys("tx.direction", "client.risk")
    }

    @Test
    fun findsOneVersion() {
        val id = jdbc.sql("select id from rule where key = 'C1' and version = 1").query(Long::class.java).single()
        assertThat(mvc.get().uri("/api/rules/$id")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("retired")
    }

    @Test
    fun editsADraftInPlace() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        val id = idOf("B2", 2)
        bedrock.reply = "Flags PEP payments above the edited limit."
        val edited = assertThat(put(id, b2Body(pepMin = 70_000.0))).hasStatusOk().bodyJson()
        edited.extractingPath("$.version").isEqualTo(2)
        edited.extractingPath("$.status").isEqualTo("draft")
        edited.extractingPath("$.params.pep_min.value").isEqualTo(70_000.0)
        edited.extractingPath("$.explanation").isEqualTo("Flags PEP payments above the edited limit.")
        assertThat(mvc.get().uri("/api/rules")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(8)
    }

    @Test
    fun editingAVersionThatIsNoDraftIs400() {
        assertThat(put(idOf("B2", 1), b2Body())).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("only a draft")
    }

    @Test
    fun editingADraftUnderAnotherKeyIs400() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        val id = idOf("B2", 2)
        assertThat(put(id, b2Body(key = "B7"))).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("keeps its key B2")
    }

    @Test
    fun editingAnUnknownVersionIs404() {
        assertThat(put("999999", b2Body())).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun explainsARuleWithoutSavingIt() {
        val explained = assertThat(explain(b2Body())).hasStatusOk().bodyJson()
        explained.extractingPath("$.explanation").isEqualTo(LOWER_B2)
        explained.extractingPath("$.model").isEqualTo("eu.anthropic.claude-opus-4-5-20251101-v1:0")
        assertThat(mvc.get().uri("/api/rules")).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(7)
    }

    @Test
    fun explainingAnInvalidRuleIs400() {
        assertThat(explain(b2Body().replace("tx.direction in", "tx.direcion in"))).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun explainingWithoutAUsableAnswerIs502() {
        bedrock.failure = BedrockException("The SSO session has expired")
        assertThat(explain(b2Body())).hasStatus(HttpStatus.BAD_GATEWAY)
            .bodyJson().extractingPath("$.detail").asString().contains("try again")
    }

    @Test
    fun sendingADraftForApprovalAssignsItToTheManager() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        val sent = assertThat(action(idOf("B2", 2), "submit")).hasStatusOk().bodyJson()
        sent.extractingPath("$.status").isEqualTo("pending")
        sent.extractingPath("$.assignee").isEqualTo("M. Svobodová")
    }

    @Test
    fun aPendingVersionCannotBeEdited() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "submit")).hasStatusOk()
        assertThat(put(idOf("B2", 2), b2Body())).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun aDraftCanBeDeleted() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        val id = idOf("B2", 2)
        assertThat(mvc.delete().uri("/api/rules/$id")).hasStatus(HttpStatus.NO_CONTENT)
        assertThat(mvc.get().uri("/api/rules/$id")).hasStatus(HttpStatus.NOT_FOUND)
        assertThat(mvc.delete().uri("/api/rules/$id")).hasStatus(HttpStatus.NOT_FOUND)
    }

    @Test
    fun onlyADraftCanBeDeleted() {
        assertThat(mvc.delete().uri("/api/rules/${idOf("B2", 1)}")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("only a draft can be deleted")
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "submit")).hasStatusOk()
        assertThat(mvc.delete().uri("/api/rules/${idOf("B2", 2)}")).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun sendingAVersionThatIsNoDraftIs400() {
        assertThat(action(idOf("B2", 1), "submit")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("only a draft")
    }

    @Test
    fun theComplianceOfficerApprovesAnAnalystsDraftAndTheEarlierVersionRetires() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "submit")).hasStatusOk()
        val approved = assertThat(action(idOf("B2", 2), "approve", user = userId("COMPLIANCE_OFFICER"))).hasStatusOk().bodyJson()
        approved.extractingPath("$.status").isEqualTo("active")
        approved.extractingPath("$.approver").isEqualTo("M. Svobodová")
        approved.extractingPath("$.assignee").isNull()
        assertThat(mvc.get().uri("/api/rules/${idOf("B2", 1)}")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("retired")
        // The approval recalculates the alerts in the background, a job named after the version.
        assertThat(awaitRecalculation("B2 v2")).isEqualTo("DONE")
    }

    @Test
    fun onlyAComplianceOfficerApproves() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "submit")).hasStatusOk()
        for (role in listOf("ANALYST", "COMPLIANCE_MANAGER")) {
            assertThat(action(idOf("B2", 2), "approve", user = userId(role))).hasStatus(HttpStatus.FORBIDDEN)
            assertThat(action(idOf("B2", 2), "reject", user = userId(role))).hasStatus(HttpStatus.FORBIDDEN)
        }
    }

    @Test
    fun aComplianceOfficerSendsTheirOwnDraftToTheComplianceManager() {
        assertThat(post(b2Body(author = "M. Svobodová"))).hasStatus(HttpStatus.CREATED)
        val id = idOf("B2", 2)
        assertThat(action(id, "submit")).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("needs an approver")
        assertThat(submitTo(id, userId("ANALYST"))).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(submitTo(id, userId("COMPLIANCE_OFFICER"))).hasStatus(HttpStatus.BAD_REQUEST)

        assertThat(submitTo(id, userId("COMPLIANCE_MANAGER"))).hasStatusOk().bodyJson()
            .extractingPath("$.assignee").isEqualTo("P. Dvořák")
        assertThat(action(id, "approve", user = userId("COMPLIANCE_OFFICER"))).hasStatus(HttpStatus.FORBIDDEN)
            .bodyJson().extractingPath("$.detail").asString().contains("wrote this version")
        assertThat(action(id, "approve", user = userId("COMPLIANCE_MANAGER"))).hasStatusOk().bodyJson()
            .extractingPath("$.approver").isEqualTo("P. Dvořák")
        awaitRecalculation("B2 v2")
    }

    @Test
    fun theSenderCannotPickThemselvesAsApprover() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        val id = idOf("B2", 2)
        val officer = userId("COMPLIANCE_OFFICER")
        assertThat(submitTo(id, officer, sender = officer)).hasStatus(HttpStatus.BAD_REQUEST)
            .bodyJson().extractingPath("$.detail").asString().contains("neither wrote nor sends it")
        assertThat(
            mvc.post().uri("/api/rules/$id/submit").header("X-User-Id", officer.toString()),
        ).hasStatus(HttpStatus.BAD_REQUEST)
        assertThat(submitTo(id, userId("COMPLIANCE_MANAGER"), sender = officer)).hasStatusOk()
    }

    @Test
    fun aComplianceManagerDecidesOnlyWhatWasSentToThem() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "submit")).hasStatusOk().bodyJson().extractingPath("$.assignee").isEqualTo("M. Svobodová")
        assertThat(action(idOf("B2", 2), "approve", user = userId("COMPLIANCE_MANAGER"))).hasStatus(HttpStatus.FORBIDDEN)
            .bodyJson().extractingPath("$.detail").asString().contains("was sent to M. Svobodová")
    }

    @Test
    fun approvingADraftThatWasNotSentIs400() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "approve", user = userId("COMPLIANCE_OFFICER"))).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun approvingWithoutAUserIs400() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "submit")).hasStatusOk()
        assertThat(action(idOf("B2", 2), "approve")).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun aRejectedVersionIsADraftAgain() {
        assertThat(post(b2Body())).hasStatus(HttpStatus.CREATED)
        assertThat(action(idOf("B2", 2), "submit")).hasStatusOk()
        val rejected = assertThat(action(idOf("B2", 2), "reject", user = userId("COMPLIANCE_OFFICER"))).hasStatusOk().bodyJson()
        rejected.extractingPath("$.status").isEqualTo("draft")
        rejected.extractingPath("$.assignee").isNull()
        assertThat(put(idOf("B2", 2), b2Body(pepMin = 70_000.0))).hasStatusOk()
    }

    @Test
    fun sendingAnUnknownVersionIs404() {
        assertThat(action("999999", "submit")).hasStatus(HttpStatus.NOT_FOUND)
    }

    private fun userId(role: String) =
        jdbc.sql("select min(id) from app_user where role = ?").param(role).query(Long::class.java).single()

    private fun submitTo(id: String, approver: Long, sender: Long? = null) =
        mvc.post().uri("/api/rules/$id/submit").contentType(MediaType.APPLICATION_JSON).content("""{"approverId": $approver}""")
            .apply { if (sender != null) header("X-User-Id", sender.toString()) }

    private fun action(id: String, name: String, user: Long? = null) =
        mvc.post().uri("/api/rules/$id/$name").apply { if (user != null) header("X-User-Id", user.toString()) }

    private fun explain(body: String) =
        mvc.post().uri("/api/rules/explanation").contentType(MediaType.APPLICATION_JSON).content(body)

    private fun idOf(key: String, version: Int) =
        jdbc.sql("select id from rule where key = ? and version = ?").params(key, version).query(Long::class.java).single().toString()

    private fun put(id: String, body: String) =
        mvc.put().uri("/api/rules/$id").contentType(MediaType.APPLICATION_JSON).content(body)

    private fun post(body: String) = mvc.post().uri("/api/rules").contentType(MediaType.APPLICATION_JSON).content(body)

    private fun b2Body(
        pepMin: Double = 50_000.0,
        key: String = "B2",
        unit: String = "amount",
        author: String = "J. Novák",
        changeReason: String = "PEP payments under 50k were missed",
    ) = """
        {
          "key": "$key", "alertType": "B", "layer": "company", "scopeSegmentId": null, "scopeClientId": null,
          "grain": "transaction", "anchor": null,
          "condition": "client.pep && tx.amount > p.pep_min && tx.direction in [\"out\", \"unknown\"]",
          "replacesKey": null, "variables": [], "params": { "pep_min": { "value": $pepMin, "unit": "$unit" } }, "author": "$author",
          "changeReason": "$changeReason"
        }
    """.trimIndent()

    private companion object {
        const val LOWER_B2 = "Flags outgoing or unknown-direction transactions of more than 50,000 CZK when the client is a politically exposed person."

        val C9_BODY = """
            {
              "key": "C9", "alertType": "C", "layer": "company", "scopeSegmentId": null, "scopeClientId": null,
              "grain": "client_anchor", "anchor": "tx.direction == \"in\"",
              "condition": "inflow > p.min_inflow && outflow * 100.0 >= p.forward_pct * inflow",
              "replacesKey": null,
              "variables": [
                { "name": "inflow", "agg": "sum", "field": "amount", "filter": "tx.direction == \"in\"",
                  "window": { "kind": "relative", "from": "PT-24H", "to": "PT0S" } },
                { "name": "payers", "agg": "set", "field": "payer_account", "filter": "tx.direction == \"in\"",
                  "window": { "kind": "relative", "from": "PT-24H", "to": "PT0S" } },
                { "name": "outflow", "agg": "sum", "field": "amount", "filter": "tx.direction == \"out\" && !(tx.payee_account in payers)",
                  "window": { "kind": "relative", "from": "PT0S", "to": "PT6H" } }
              ],
              "params": { "min_inflow": { "value": 100000, "unit": "amount" }, "forward_pct": { "value": 80, "unit": "percent" } },
              "author": "J. Novák",
              "changeReason": "Flow-through cases from the July review"
            }
        """.trimIndent()
    }
}
