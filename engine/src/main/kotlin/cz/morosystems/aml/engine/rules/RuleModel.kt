package cz.morosystems.aml.engine.rules

import java.time.Duration
import java.time.OffsetDateTime

enum class Grain { TRANSACTION, CLIENT_DAY, CLIENT_ANCHOR }

enum class Agg { SUM, MAX, MIN, COUNT, SET }

enum class Layer { COMPANY, SEGMENT, CLIENT }

/** What a parameter's value counts: [AMOUNT] is CZK (ADR-0037), the others are plain numbers. */
enum class ParamUnit { AMOUNT, PERCENT, MULTIPLE }

data class Param(val value: Double, val unit: ParamUnit)

sealed interface Window {
    data object Day : Window

    /** Window `(anchor + from, anchor + to]`: start exclusive, end inclusive. */
    data class Relative(val from: Duration, val to: Duration) : Window
}

data class VariableDefinition(
    val position: Int,
    val name: String,
    val agg: Agg,
    val field: String,
    val filter: String,
    val window: Window,
)

data class RuleDefinition(
    val id: Long,
    val key: String,
    val version: Int,
    val alertType: String,
    val layer: Layer,
    val scopeSegmentId: Long?,
    val scopeClientId: String?,
    val grain: Grain,
    val anchor: String?,
    val condition: String,
    val replacesKey: String?,
    val variables: List<VariableDefinition>,
    val params: Map<String, Param> = emptyMap(),
)

/**
 * A stored rule version with its lifecycle and explanation; [status] is `draft`, `pending`, `approved`, `active` or `retired`.
 *
 * @property assignee the compliance officer a `pending` version waits for, by name
 */
data class RuleVersion(
    val rule: RuleDefinition,
    val name: String?,
    val status: String,
    val author: String?,
    val createdAt: OffsetDateTime,
    val explanation: String?,
    val explanationModel: String?,
    val assignee: String? = null,
    val approver: String? = null,
    val approvedAt: OffsetDateTime? = null,
    /** Why the version was proposed; null on versions saved before a reason was required. */
    val changeReason: String? = null,
)

data class NewRule(
    val key: String,
    val alertType: String,
    val layer: Layer,
    val scopeSegmentId: Long?,
    val scopeClientId: String?,
    val grain: Grain,
    val anchor: String?,
    val condition: String,
    val replacesKey: String?,
    val variables: List<VariableDefinition>,
    val params: Map<String, Param>,
    val author: String,
    /** null keeps the name of the key's latest version. */
    val name: String? = null,
    /** Why the version is proposed; required to save, not to preview. */
    val changeReason: String? = null,
)

data class Segment(val id: Long, val name: String, val predicate: String)
