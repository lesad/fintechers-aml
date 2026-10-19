package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.cel.RuleCompileException
import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.rules.Agg
import cz.morosystems.aml.engine.rules.ConfigurationException
import cz.morosystems.aml.engine.rules.Layer
import cz.morosystems.aml.engine.rules.Param
import cz.morosystems.aml.engine.rules.ParamJson
import cz.morosystems.aml.engine.rules.ParamUnit
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.rules.RuleResolver
import cz.morosystems.aml.engine.rules.VariableDefinition
import cz.morosystems.aml.engine.rules.VariableJson
import cz.morosystems.aml.engine.rules.Window
import cz.morosystems.aml.engine.rules.WindowJson
import cz.morosystems.aml.engine.sql.GrainQueryBuilder
import cz.morosystems.aml.engine.sql.Period
import cz.morosystems.aml.engine.summary.InvalidSummaryException
import cz.morosystems.aml.engine.summary.Sentence
import cz.morosystems.aml.engine.summary.checkNumbers
import cz.morosystems.aml.engine.summary.checkSummary
import cz.morosystems.aml.engine.summary.numbersNotIn
import cz.morosystems.aml.engine.summary.sentencesOf
import java.time.Duration
import java.time.format.DateTimeParseException
import org.springframework.stereotype.Component

/**
 * Turns the model's untrusted rule change into a [Suggestion], or throws [InvalidSuggestionException].
 * The model only names the key, layer, condition and values; code fills the rest and proves the change takes effect.
 */
@Component
class SuggestionChecker(
    private val compiler: RuleCompiler,
    private val resolver: RuleResolver,
    private val queries: GrainQueryBuilder,
) {
    fun check(reply: Map<*, *>, input: Map<*, *>, context: SuggestionContext): Checked {
        val kind = reply["kind"] as? String
        val rows = reply["params"] as? List<*> ?: invalid("params is not a list")
        val variables = reply["variables"] as? List<*> ?: invalid("variables is not a list")
        val condition = when (val raw = reply["condition"]) {
            null -> null
            is String -> raw.takeIf { it.isNotBlank() }
            else -> invalid("condition is not text")
        }
        when (kind) {
            "none" -> if (rows.isNotEmpty() || variables.isNotEmpty() || condition != null) invalid("kind none carries no params, variables or condition")
            "rule_version" -> Unit
            else -> invalid("unknown kind '$kind'")
        }
        if (kind == "none") return Checked(Suggestion(kind, explain(reply, input, context, emptyList()), null, null, null), null)

        val key = reply["ruleKey"] as? String
        if (key == null || key !in context.hitKeys) invalid("rule '$key' did not hit this alert")
        val layer = when (val name = reply["layer"]) {
            "client" -> Layer.CLIENT
            "company" -> Layer.COMPANY
            else -> invalid("layer '$name' is not allowed, use client or company")
        }
        val clientId = context.alert.clientId
        val current = resolve(context.rules, context)
        val base = current.clientsByRule.entries.firstOrNull { it.key.key == key && clientId in it.value }?.key
            ?: invalid("no active rule '$key' applies to client $clientId")
        if (layer == Layer.COMPANY && base.layer != Layer.COMPANY) invalid("$key is a ${base.layer.name.lowercase()} rule, propose a client-layer change")

        val target = if (layer == Layer.CLIENT && base.layer != Layer.CLIENT) clientKey(key, clientId) else key
        val scope = if (layer == Layer.CLIENT) clientId else null
        val replaces = when {
            layer == Layer.COMPANY -> null
            base.layer == Layer.CLIENT -> base.replacesKey
            else -> key
        }
        val earlier = context.latest[target]
        if (earlier != null && (earlier.layer != layer || earlier.scopeClientId != scope || earlier.replacesKey != replaces)) {
            invalid("rule $target already exists with another layer, client or replaced rule")
        }
        val retires = context.rules.firstOrNull { it.key == target }

        val proposed = rows.mapIndexed { i, row -> paramOf(row, i) }
        proposed.groupingBy { it.first }.eachCount().entries.firstOrNull { it.value > 1 }?.let { invalid("parameter '${it.key}' appears more than once") }
        if (condition == null && variables.isEmpty() && proposed.all { (name, p) -> base.params[name]?.value == p.value }) {
            invalid("the suggestion changes nothing in rule $key")
        }
        val params = base.params + proposed.map { (name, p) ->
            val unit = base.params[name]?.unit ?: p.unit ?: invalid("new parameter '$name' needs a unit: amount, percent or multiple")
            name to Param(p.value, unit)
        }
        val definition = RuleDefinition(
            0, target, (earlier?.version ?: 0) + 1, base.alertType, layer, null, scope, base.grain, base.anchor,
            condition ?: base.condition, replaces, if (variables.isEmpty()) base.variables else variables.mapIndexed(::variableOf), params,
        )
        checkValues(definition, base, context.values)
        compileAndBuild(definition, clientId)

        val resolved = resolve(context.rules.filterNot { it == retires } + definition, context)
        checkTakesEffect(resolved.clientsByRule, definition, base, retires, current.clientsByRule, clientId)

        val explanation = explain(reply, input, context, proposed.map { it.second.value })
        val ruleExplanation = ruleExplanation(reply["ruleExplanation"], input, proposed.map { it.second.value })
        val suggestion = Suggestion(kind, explanation, suggestedRule(definition), base.params.json(), retires?.let { RuleRef(it.key, it.version) }, ruleExplanation)
        return Checked(suggestion, Draft(definition, base, retires, resolved.clientsByRule[definition].orEmpty()))
    }

    private fun checkTakesEffect(
        after: Map<RuleDefinition, Set<String>>,
        definition: RuleDefinition,
        base: RuleDefinition,
        retires: RuleDefinition?,
        before: Map<RuleDefinition, Set<String>>,
        clientId: String,
    ) {
        val clients = after[definition].orEmpty()
        if (definition.layer == Layer.COMPANY && clientId !in clients) {
            invalid("the new version of ${definition.key} would not apply to client $clientId, a client rule replaces it")
        }
        if (definition.layer == Layer.CLIENT) {
            if (clients != setOf(clientId)) invalid("the new rule ${definition.key} would not apply to client $clientId only")
            if (after.any { (rule, ids) -> rule.key in setOf(definition.key, base.key) && rule != definition && clientId in ids }) {
                invalid("${base.key} would still apply to client $clientId")
            }
        } else if (retires != null && !clients.containsAll(before[retires].orEmpty())) {
            invalid("the new version of ${definition.key} would drop clients the retired version covered")
        }
    }

    /**
     * A text comparison the model adds may only use a value the field takes in the data, so a condition cannot hinge on an
     * invented `tx.type`. Comparisons the base rule already makes are left alone.
     */
    private fun checkValues(definition: RuleDefinition, base: RuleDefinition, values: Map<String, List<String>>) {
        val existing = literals(base).toSet()
        literals(definition).filterNot { it in existing }.forEach { (field, value) ->
            val known = values[field] ?: return@forEach
            if (value !in known) invalid("$field is never \"$value\"; its values are ${known.joinToString()}")
        }
    }

    private fun literals(rule: RuleDefinition): List<Pair<String, String>> =
        (listOf(rule.condition) + rule.variables.map { it.filter }).flatMap { text ->
            COMPARED.findAll(text).map { it.groupValues[1] to it.groupValues[2] }.toList() +
                IN_LIST.findAll(text).flatMap { m -> QUOTED.findAll(m.groupValues[2]).map { m.groupValues[1] to it.groupValues[1] } }.toList()
        }

    private fun compileAndBuild(definition: RuleDefinition, clientId: String) {
        try {
            compiler.compile(definition, definition.params.keys)
        } catch (e: RuleCompileException) {
            invalid(e.message ?: "condition does not compile")
        }
        try {
            queries.build(definition, Period.JULY_2026, setOf(clientId))
        } catch (e: RuntimeException) {
            invalid(e.message ?: "the rule cannot be turned into SQL")
        }
    }

    internal fun resolve(rules: List<RuleDefinition>, context: SuggestionContext) =
        try {
            resolver.resolve(rules, context.segments, context.clients)
        } catch (e: ConfigurationException) {
            invalid(e.message ?: "the rules do not resolve")
        }

    /** The same checks as a stored rule explanation (RuleExplainer): one plain statement that starts with "Flags". */
    private fun ruleExplanation(raw: Any?, input: Map<*, *>, values: List<Double>): String {
        val text = (raw as? String)?.trim().orEmpty()
        when {
            text.isEmpty() -> invalid("ruleExplanation is missing")
            text.length > MAX_RULE_EXPLANATION -> invalid("ruleExplanation is longer than $MAX_RULE_EXPLANATION characters")
            !text.startsWith("Flags") -> invalid("ruleExplanation does not start with Flags")
            "```" in text -> invalid("ruleExplanation contains a code fence")
        }
        numbersNotIn(text, input, values).takeIf { it.isNotEmpty() }?.let { invalid("ruleExplanation has numbers not in the input: $it") }
        return text
    }

    private fun explain(reply: Map<*, *>, input: Map<*, *>, context: SuggestionContext, values: List<Double>): List<Sentence> =
        try {
            val known = context.activity.map { it.ref }.toSet() + REASON + CLIENT_REF + context.existingRules.map { it.ref() } +
                listOfNotNull(TRIAGE_REF.takeIf { context.triage != null }, SUMMARY_REF.takeIf { context.summary != null })
            checkNumbers(checkSummary(sentencesOf(reply["explanation"]), known, maxSentences = 2, requiredRef = REASON, noun = "explanation"), input, values)
        } catch (e: InvalidSummaryException) {
            invalid(e.message ?: "invalid explanation")
        }

    /** A proposed value; [unit] is only needed, and only read, for a new parameter. */
    private data class Proposed(val value: Double, val unit: ParamUnit?)

    private fun paramOf(row: Any?, i: Int): Pair<String, Proposed> {
        val map = row as? Map<*, *> ?: invalid("param $i is not an object")
        val name = (map["name"] as? String)?.takeIf { it.isNotBlank() } ?: invalid("param $i has no name")
        val value = (map["value"] as? Number)?.toDouble()
        if (value == null || value <= 0) invalid("value of '$name' must be a number above 0")
        val unit = (map["unit"] as? String)?.let { raw ->
            ParamUnit.entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: invalid("parameter '$name' has unknown unit '$raw'")
        }
        return name to Proposed(value, unit)
    }

    private fun variableOf(i: Int, raw: Any?): VariableDefinition {
        val map = raw as? Map<*, *> ?: invalid("variable $i is not an object")
        fun text(field: String) = map[field] as? String ?: invalid("variable $i has no $field")
        val agg = try {
            Agg.valueOf(text("agg").uppercase())
        } catch (e: IllegalArgumentException) {
            invalid("variable $i has unknown agg '${map["agg"]}'")
        }
        val window = when (val kind = text("windowKind")) {
            "day" -> Window.Day
            "relative" -> Window.Relative(duration(map["windowFrom"], i), duration(map["windowTo"], i))
            else -> invalid("variable $i has unknown windowKind '$kind'")
        }
        return VariableDefinition((map["position"] as? Number)?.toInt() ?: i, text("name"), agg, text("field"), text("filter"), window)
    }

    private fun duration(raw: Any?, i: Int): Duration =
        try {
            Duration.parse(raw as? String ?: invalid("variable $i has a relative window without bounds"))
        } catch (e: DateTimeParseException) {
            invalid("variable $i has a bad window bound '$raw'")
        }

    private fun suggestedRule(rule: RuleDefinition) = SuggestedRule(
        rule.key, rule.version, rule.alertType, rule.layer.name.lowercase(), rule.scopeSegmentId, rule.scopeClientId, rule.grain.name.lowercase(), rule.anchor,
        rule.condition, rule.replacesKey, rule.variables.map { v ->
            val window = when (val w = v.window) {
                Window.Day -> WindowJson("day")
                is Window.Relative -> WindowJson("relative", iso(w.from), iso(w.to))
            }
            VariableJson(v.name, v.agg.name.lowercase(), v.field, v.filter, window)
        },
        rule.params.json(),
    )

    /** The variable as the model sees and writes it, with ISO-8601 window bounds. */
    internal fun suggestedVariable(v: VariableDefinition): SuggestedVariable {
        val relative = v.window as? Window.Relative
        return SuggestedVariable(v.position, v.name, v.agg.name.lowercase(), v.field, v.filter, if (relative == null) "day" else "relative", relative?.from?.let(::iso), relative?.to?.let(::iso))
    }

    private fun iso(duration: Duration) = if (duration.isNegative) "-${duration.negated()}" else duration.toString()

    private fun Map<String, Param>.json() = mapValues { (_, p) -> ParamJson(p.value, p.unit.name.lowercase()) }

    private fun invalid(message: String): Nothing = throw InvalidSuggestionException(message)

    private companion object {
        const val REASON = "reason"
        const val MAX_RULE_EXPLANATION = 500
        val COMPARED = Regex("""\b((?:tx|client)\.\w+)\s*[!=]=\s*"([^"]*)"""")
        val IN_LIST = Regex("""\b((?:tx|client)\.\w+)\s+in\s+\[([^\]]*)]""")
        val QUOTED = Regex(""""([^"]*)"""")
    }
}
