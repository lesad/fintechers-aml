package cz.morosystems.aml.engine.rules

import java.time.Duration
import java.time.OffsetDateTime

enum class Grain { TRANSACTION, CLIENT_DAY, CLIENT_ANCHOR }

enum class Agg { SUM, MAX, MIN, COUNT, SET }

enum class Layer { COMPANY, SEGMENT, CLIENT }

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
    val params: Map<String, Long> = emptyMap(),
)

/** A stored rule version with its lifecycle and explanation; [status] is `draft`, `approved`, `active` or `retired`. */
data class RuleVersion(
    val rule: RuleDefinition,
    val status: String,
    val author: String?,
    val createdAt: OffsetDateTime,
    val explanation: String?,
    val explanationModel: String?,
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
    val params: Map<String, Long>,
    val author: String,
)

data class Segment(val id: Long, val name: String, val predicate: String)
