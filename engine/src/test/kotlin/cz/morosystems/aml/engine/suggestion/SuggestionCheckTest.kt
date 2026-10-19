package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.alert.Alert
import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.rules.Agg
import cz.morosystems.aml.engine.rules.Grain
import cz.morosystems.aml.engine.rules.Layer
import cz.morosystems.aml.engine.rules.Param
import cz.morosystems.aml.engine.rules.ParamJson
import cz.morosystems.aml.engine.rules.ParamUnit
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.rules.RuleResolver
import cz.morosystems.aml.engine.rules.RuleVersion
import cz.morosystems.aml.engine.rules.VariableDefinition
import cz.morosystems.aml.engine.rules.VariableJson
import cz.morosystems.aml.engine.rules.Window
import cz.morosystems.aml.engine.rules.WindowJson
import cz.morosystems.aml.engine.sql.Cel2SqlFilterCompiler
import cz.morosystems.aml.engine.sql.GrainQueryBuilder
import cz.morosystems.aml.engine.summary.Activity
import java.time.OffsetDateTime
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class SuggestionCheckTest {
    private val compiler = RuleCompiler()
    private val checker = SuggestionChecker(compiler, RuleResolver(compiler), GrainQueryBuilder(Cel2SqlFilterCompiler()))

    private val dayVolume = VariableDefinition(0, "day_volume", Agg.SUM, "amount", "true", Window.Day)
    private val a1 = RuleDefinition(
        1, "A1", 1, "A", Layer.COMPANY, null, null, Grain.CLIENT_DAY, null,
        "day_volume * 100.0 > p.projected_pct * client.expected_monthly_volume", null, listOf(dayVolume), mapOf("projected_pct" to Param(25.0, ParamUnit.PERCENT)),
    )
    private val a3 = RuleDefinition(
        3, "A3", 1, "A", Layer.COMPANY, null, null, Grain.TRANSACTION, null,
        "tx.amount > p.max_multiple * client.q2_max_tx", null, emptyList(), mapOf("max_multiple" to Param(2.0, ParamUnit.MULTIPLE)),
    )
    private val a3Client = RuleDefinition(
        4, "A3-K1", 1, "A", Layer.CLIENT, null, "K1", Grain.TRANSACTION, null,
        "tx.amount > p.max_multiple * client.q2_max_tx", "A3", emptyList(), mapOf("max_multiple" to Param(3.0, ParamUnit.MULTIPLE)),
    )
    private val alert = Alert(1, 1, "A", "K1", null, OffsetDateTime.now(), 2)
    private val context = SuggestionContext(
        alert, "salary season", listOf(Activity("rule:A1", "rule_hit", mapOf("projected_pct" to 25)), Activity("rule:A3", "rule_hit", mapOf("max_multiple" to 2))),
        setOf("A1", "A3"), listOf(a1, a3), emptyList(),
        listOf(mapOf("id" to "K1", "expected_monthly_volume" to 1000.0, "q2_max_tx" to 10.0), mapOf("id" to "K2", "expected_monthly_volume" to 2000.0, "q2_max_tx" to 20.0)),
        mapOf("A1" to a1, "A3" to a3),
    )
    private val withValues = context.copy(values = mapOf("tx.type" to listOf("incoming payment", "outgoing payment", "remittance")))
    private val clientRuleContext = context.copy(hitKeys = setOf("A3-K1"), rules = listOf(a1, a3, a3Client), latest = mapOf("A3-K1" to a3Client))
    private val input = mapOf("reason" to "salary season", "activity" to listOf(mapOf("ref" to "rule:A1", "data" to mapOf("projected_pct" to 25, "max_multiple" to 2))))

    private fun reply(
        kind: String = "rule_version",
        key: String = "A1",
        layer: String = "client",
        condition: String? = null,
        variables: List<Map<String, Any?>> = emptyList(),
        params: List<Map<String, Any?>> = listOf(mapOf("name" to "projected_pct", "value" to 60)),
        explanation: List<Map<String, Any?>> = listOf(mapOf("text" to "Moves projected_pct from 25 to 60.", "refs" to listOf("reason", "rule:A1"))),
        ruleExplanation: String? = if (kind == "none") null else "Flags a day for this client only when its volume is well above the declared monthly volume.",
    ): Map<String, Any?> = mapOf(
        "kind" to kind, "ruleKey" to key, "layer" to layer, "condition" to condition, "variables" to variables, "params" to params, "explanation" to explanation,
        "ruleExplanation" to ruleExplanation,
    )

    private fun check(reply: Map<String, Any?>, ctx: SuggestionContext = context) = checker.check(reply, input, ctx).suggestion

    private fun assertRejected(reply: Map<String, Any?>, text: String, ctx: SuggestionContext = context) {
        assertThatThrownBy { check(reply, ctx) }.isInstanceOf(InvalidSuggestionException::class.java).hasMessageContaining(text)
    }

    @Test
    fun acceptsAClientThresholdAsANewClientRule() {
        val suggestion = check(reply())
        assertThat(suggestion.kind).isEqualTo("rule_version")
        assertThat(suggestion.rule).isEqualTo(
            SuggestedRule(
                "A1-K1", 1, "A", "client", null, "K1", "client_day", null, a1.condition, "A1",
                listOf(VariableJson("day_volume", "sum", "amount", "true", WindowJson("day"))), mapOf("projected_pct" to ParamJson(60.0, "percent")),
            ),
        )
        assertThat(suggestion.previousParams).isEqualTo(mapOf("projected_pct" to ParamJson(25.0, "percent")))
        assertThat(suggestion.retires).isNull()
    }

    @Test
    fun acceptsAClientCondition() {
        val condition = "tx.amount > p.max_multiple * client.q2_max_tx && tx.payee_account != \"ACZ1\""
        val suggestion = check(reply(key = "A3", condition = condition, params = emptyList(), explanation = reasonOnly("Excludes the known payee account.")))
        assertThat(suggestion.rule?.key).isEqualTo("A3-K1")
        assertThat(suggestion.rule?.condition).isEqualTo(condition)
        assertThat(suggestion.rule?.params).isEqualTo(mapOf("max_multiple" to ParamJson(2.0, "multiple")))
    }

    @Test
    fun acceptsACompanySeasonalVersionWithANewParameter() {
        val condition = "day_volume * 100.0 > (day.month == 12 ? p.december_pct : p.projected_pct) * client.expected_monthly_volume"
        val suggestion = check(
            reply(layer = "company", condition = condition, params = listOf(mapOf("name" to "december_pct", "value" to 50, "unit" to "percent")), explanation = reasonOnly("December gets 50.")),
        )
        assertThat(suggestion.rule?.key).isEqualTo("A1")
        assertThat(suggestion.rule?.version).isEqualTo(2)
        assertThat(suggestion.rule?.replacesKey).isNull()
        assertThat(suggestion.rule?.params).isEqualTo(mapOf("projected_pct" to ParamJson(25.0, "percent"), "december_pct" to ParamJson(50.0, "percent")))
        assertThat(suggestion.retires).isEqualTo(RuleRef("A1", 1))
    }

    @Test
    fun continuesTheVersionsOfAnEarlierClientDraft() {
        val draft = a1.copy(id = 9, key = "A1-K1", version = 3, layer = Layer.CLIENT, scopeClientId = "K1", replacesKey = "A1")
        val suggestion = check(reply(), context.copy(latest = context.latest + ("A1-K1" to draft)))
        assertThat(suggestion.rule?.version).isEqualTo(4)
        assertThat(suggestion.retires).isNull()
    }

    @Test
    fun replacesTheActiveClientRule() {
        val suggestion = check(reply(key = "A3-K1", params = listOf(mapOf("name" to "max_multiple", "value" to 4)), explanation = reasonOnly("Raise it to 4.")), clientRuleContext)
        assertThat(suggestion.rule?.key).isEqualTo("A3-K1")
        assertThat(suggestion.rule?.version).isEqualTo(2)
        assertThat(suggestion.rule?.replacesKey).isEqualTo("A3")
        assertThat(suggestion.previousParams).isEqualTo(mapOf("max_multiple" to ParamJson(3.0, "multiple")))
        assertThat(suggestion.retires).isEqualTo(RuleRef("A3-K1", 1))
    }

    @Test
    fun acceptsNone() {
        val suggestion = check(reply(kind = "none", params = emptyList(), explanation = reasonOnly("No rule change fits.")))
        assertThat(suggestion.kind).isEqualTo("none")
        assertThat(suggestion.rule).isNull()
        assertThat(suggestion.previousParams).isNull()
    }

    @Test
    fun rejectsAnUnknownKind() = assertRejected(reply(kind = "delete"), "kind")

    @Test
    fun rejectsTheRetiredParamOverrideKind() = assertRejected(reply(kind = "param_override"), "param_override")

    @Test
    fun rejectsNoneWithRows() = assertRejected(reply(kind = "none"), "none")

    @Test
    fun rejectsAKeyThatDidNotHit() = assertRejected(reply(key = "B1"), "B1")

    @Test
    fun rejectsTheSegmentLayer() = assertRejected(reply(layer = "segment"), "segment")

    @Test
    fun rejectsACompanyChangeToAClientRule() = assertRejected(reply(key = "A3-K1", layer = "company"), "client-layer", clientRuleContext)

    @Test
    fun rejectsARuleThatAClientRuleReplacesForTheAlertsClient() =
        assertRejected(reply(key = "A3", layer = "company", condition = "tx.amount > 1000.0", params = emptyList()), "K1", clientRuleContext.copy(hitKeys = setOf("A3")))

    @Test
    fun rejectsAClientKeyTakenByAnotherScope() {
        val other = a1.copy(id = 9, key = "A1-K1", version = 1)
        assertRejected(reply(), "already exists", context.copy(latest = context.latest + ("A1-K1" to other)))
    }

    @Test
    fun rejectsAChangeThatChangesNothing() = assertRejected(reply(params = listOf(mapOf("name" to "projected_pct", "value" to 25))), "changes nothing")

    @Test
    fun rejectsANonPositiveValue() = assertRejected(reply(params = listOf(mapOf("name" to "projected_pct", "value" to 0))), "value")

    @Test
    fun rejectsAConditionThatDoesNotCompile() = assertRejected(reply(key = "A3", condition = "tx.amount >", params = emptyList()), "condition")

    @Test
    fun rejectsTxInAClientDayCondition() = assertRejected(reply(condition = "tx.amount > 0", params = emptyList()), "condition")

    @Test
    fun rejectsAVariableThatClashesWithATransactionColumn() {
        val clash = mapOf("position" to 0, "name" to "month", "agg" to "sum", "field" to "amount", "filter" to "true", "windowKind" to "day", "windowFrom" to null, "windowTo" to null)
        assertRejected(reply(condition = "true", variables = listOf(clash), params = emptyList()), "clashes")
    }

    @Test
    fun rejectsANewParameterWithoutAValue() {
        val condition = "day_volume * 100.0 > p.december_pct * client.expected_monthly_volume"
        assertRejected(reply(layer = "company", condition = condition, params = emptyList()), "december_pct")
    }

    @Test
    fun rejectsAnExplanationThatDoesNotCiteTheReason() =
        assertRejected(reply(explanation = listOf(mapOf("text" to "From 25 to 60.", "refs" to listOf("rule:A1")))), "reason")

    @Test
    fun rejectsAnInventedNumber() = assertRejected(reply(explanation = reasonOnly("Raise it to 75.")), "75")

    @Test
    fun acceptsProposedValuesInTheExplanation() {
        val money = mapOf("reason" to "salary season", "activity" to listOf(mapOf("ref" to "rule:A1", "data" to mapOf("limit" to 100000))))
        val explanation = reasonOnly("Raises the limit from CZK 100,000 to CZK 200,000.")
        val suggestion = checker.check(reply(params = listOf(mapOf("name" to "projected_pct", "value" to 200000)), explanation = explanation), money, context).suggestion
        assertThat(suggestion.rule?.params?.get("projected_pct")?.value).isEqualTo(200000.0)
    }

    @Test
    fun rejectsANewParameterWithoutAUnit() {
        val condition = "day_volume * 100.0 > p.december_pct * client.expected_monthly_volume"
        assertRejected(reply(layer = "company", condition = condition, params = listOf(mapOf("name" to "december_pct", "value" to 50))), "needs a unit")
    }

    @Test
    fun acceptsNoneWithABlankCondition() {
        assertThat(check(reply(kind = "none", condition = "", params = emptyList(), explanation = reasonOnly("No rule change fits."))).kind).isEqualTo("none")
    }

    @Test
    fun aBlankConditionKeepsTheRulesCondition() {
        assertThat(check(reply(condition = "")).rule?.condition).isEqualTo(a1.condition)
    }

    @Test
    fun rejectsAConditionThatIsNotText() =
        assertRejected(reply(kind = "none", params = emptyList(), explanation = reasonOnly("No rule change fits.")) + ("condition" to 5), "condition")

    @Test
    fun rejectsTheSameParameterTwice() {
        val twice = listOf(mapOf("name" to "projected_pct", "value" to 60), mapOf("name" to "projected_pct", "value" to 70))
        assertRejected(reply(params = twice), "more than once")
    }

    @Test
    fun acceptsAnExplanationCitingTheClient() {
        val explanation = listOf(mapOf("text" to "The client says it is salary season.", "refs" to listOf("reason", "client")))
        assertThat(check(reply(explanation = explanation)).kind).isEqualTo("rule_version")
    }

    @Test
    fun aNoneMayCiteAnExistingDraftAndTheTriage() {
        val draft = RuleVersion(a1.copy(id = 9, key = "A1-K1", layer = Layer.CLIENT, scopeClientId = "K1", replacesKey = "A1"), null, "draft", "J. Novák", OffsetDateTime.now(), null, null)
        val ctx = context.copy(existingRules = listOf(draft), triage = mapOf("disposition" to "REVIEW_LOW"))
        val explanation = listOf(mapOf("text" to "A draft already covers this client.", "refs" to listOf("reason", "existing:A1-K1:v1", "triage")))
        assertThat(check(reply(kind = "none", params = emptyList(), explanation = explanation), ctx).kind).isEqualTo("none")
    }

    @Test
    fun rejectsTheSummaryRefWhenThereIsNoSummary() =
        assertRejected(reply(explanation = listOf(mapOf("text" to "As summarised.", "refs" to listOf("reason", "summary")))), "summary")

    @Test
    fun rejectsATextValueTheFieldNeverTakes() =
        assertRejected(reply(key = "A3", condition = "tx.amount > p.max_multiple * client.q2_max_tx && tx.type != \"payroll\"", params = emptyList()), "never \"payroll\"", withValues)

    @Test
    fun rejectsAnUnknownValueInAList() =
        assertRejected(reply(key = "A3", condition = "tx.amount > p.max_multiple * client.q2_max_tx && !(tx.type in [\"remittance\", \"payroll\"])", params = emptyList()), "payroll", withValues)

    @Test
    fun acceptsATextValueTheFieldTakes() {
        val condition = "tx.amount > p.max_multiple * client.q2_max_tx && tx.type != \"remittance\""
        assertThat(check(reply(key = "A3", condition = condition, params = emptyList(), explanation = reasonOnly("Leaves out remittances.")), withValues).rule?.condition).isEqualTo(condition)
    }

    @Test
    fun returnsTheRuleExplanation() {
        assertThat(check(reply()).ruleExplanation).startsWith("Flags a day for this client")
    }

    @Test
    fun rejectsAMissingRuleExplanation() = assertRejected(reply(ruleExplanation = null), "ruleExplanation is missing")

    @Test
    fun rejectsARuleExplanationThatDoesNotStartWithFlags() = assertRejected(reply(ruleExplanation = "This rule flags big days."), "Flags")

    @Test
    fun rejectsAnInventedNumberInTheRuleExplanation() =
        assertRejected(reply(ruleExplanation = "Flags a day above 75 percent of the declared volume."), "75")

    @Test
    fun acceptsTheProposedValueInTheRuleExplanation() {
        assertThat(check(reply(ruleExplanation = "Flags a day above 60 percent of the declared monthly volume, for this client only.")).ruleExplanation).contains("60")
    }

    @Test
    fun rejectsAThreeSentenceWhy() {
        val three = List(3) { mapOf("text" to "The reviewer explains it.", "refs" to listOf("reason")) }
        assertRejected(reply(explanation = three), "explanation")
    }

    @Test
    fun explanationErrorsSayExplanation() = assertRejected(reply(explanation = emptyList()), "explanation has no sentences")

    private fun reasonOnly(text: String) = listOf(mapOf("text" to text, "refs" to listOf("reason")))
}
