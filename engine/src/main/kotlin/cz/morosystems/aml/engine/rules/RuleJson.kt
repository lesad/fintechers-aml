package cz.morosystems.aml.engine.rules

import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Duration
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

@JsonInclude(JsonInclude.Include.NON_NULL)
data class WindowJson(val kind: String, val from: String? = null, val to: String? = null)

data class VariableJson(val name: String, val agg: String, val field: String, val filter: String, val window: WindowJson)

/** The POST body of `/api/rules`; enums are lowercase, windows ISO-8601 durations. */
data class RuleBody(
    val key: String,
    val alertType: String,
    val layer: String,
    val scopeSegmentId: Long? = null,
    val scopeClientId: String? = null,
    val grain: String,
    val anchor: String? = null,
    val condition: String,
    val replacesKey: String? = null,
    val variables: List<VariableJson> = emptyList(),
    val params: Map<String, Long> = emptyMap(),
    val author: String,
)

data class RuleVersionJson(
    val id: Long,
    val key: String,
    val version: Int,
    val status: String,
    val alertType: String,
    val layer: String,
    val scopeSegmentId: Long?,
    val scopeClientId: String?,
    val grain: String,
    val anchor: String?,
    val condition: String,
    val replacesKey: String?,
    val variables: List<VariableJson>,
    val params: Map<String, Long>,
    val author: String?,
    val createdAt: OffsetDateTime,
    val explanation: String?,
    val explanationModel: String?,
)

fun RuleVersion.toJson() = RuleVersionJson(
    id = rule.id,
    key = rule.key,
    version = rule.version,
    status = status,
    alertType = rule.alertType,
    layer = rule.layer.name.lowercase(),
    scopeSegmentId = rule.scopeSegmentId,
    scopeClientId = rule.scopeClientId,
    grain = rule.grain.name.lowercase(),
    anchor = rule.anchor,
    condition = rule.condition,
    replacesKey = rule.replacesKey,
    variables = rule.variables.map { v ->
        val window = when (val w = v.window) {
            Window.Day -> WindowJson("day")
            is Window.Relative -> WindowJson("relative", w.from.toString(), w.to.toString())
        }
        VariableJson(v.name, v.agg.name.lowercase(), v.field, v.filter, window)
    },
    params = rule.params,
    author = author,
    createdAt = createdAt,
    explanation = explanation,
    explanationModel = explanationModel,
)

/** @throws InvalidRuleException for an unknown enum value or an unparseable window */
fun RuleBody.toNewRule() = NewRule(
    key = key.trim(),
    alertType = alertType.trim(),
    layer = enumOf<Layer>("layer", layer),
    scopeSegmentId = scopeSegmentId,
    scopeClientId = scopeClientId?.trim()?.ifEmpty { null },
    grain = enumOf<Grain>("grain", grain),
    anchor = anchor?.trim()?.ifEmpty { null },
    condition = condition.trim(),
    replacesKey = replacesKey?.trim()?.ifEmpty { null },
    variables = variables.mapIndexed { i, v ->
        VariableDefinition(i + 1, v.name.trim(), enumOf<Agg>("aggregation", v.agg), v.field.trim(), v.filter.trim().ifEmpty { "true" }, v.window.toWindow(v.name))
    },
    params = params,
    author = author.trim(),
)

private fun WindowJson.toWindow(variable: String): Window = when (kind) {
    "day" -> Window.Day
    "relative" -> try {
        Window.Relative(Duration.parse(requireNotNull(from) { "from" }), Duration.parse(requireNotNull(to) { "to" }))
    } catch (e: IllegalArgumentException) {
        throw InvalidRuleException("variable $variable: a relative window needs ISO-8601 from and to (${e.message})")
    } catch (e: DateTimeParseException) {
        throw InvalidRuleException("variable $variable: a relative window needs ISO-8601 from and to (${e.message})")
    }
    else -> throw InvalidRuleException("variable $variable: unknown window kind '$kind'")
}

private inline fun <reified E : Enum<E>> enumOf(field: String, value: String): E =
    enumValues<E>().firstOrNull { it.name.equals(value.trim(), ignoreCase = true) }
        ?: throw InvalidRuleException("unknown $field '$value'")
