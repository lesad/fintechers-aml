package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.alert.Alert
import cz.morosystems.aml.engine.rules.ParamJson
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.rules.RuleVersion
import cz.morosystems.aml.engine.rules.Segment
import cz.morosystems.aml.engine.rules.VariableJson
import cz.morosystems.aml.engine.summary.Activity
import cz.morosystems.aml.engine.summary.Sentence

/**
 * A checked, unsaved rule change. `kind` is `rule_version` or `none`.
 * [previousParams] are the values of the rule the new version retires or replaces, for comparison.
 * [ruleExplanation] says in plain English what the drafted rule flags; null for `none`.
 */
data class Suggestion(
    val kind: String,
    val explanation: List<Sentence>,
    val rule: SuggestedRule?,
    val previousParams: Map<String, ParamJson>?,
    val retires: RuleRef?,
    val ruleExplanation: String? = null,
    /** What the change would do to the alerts of the alert's run; code measures it. Null when the model proposed nothing. */
    val impact: Impact? = null,
    /** Why code turned a valid draft into `none`: it would not stop this alert, is unsafe or changes too little. */
    val declined: String? = null,
)

/** For one scope: hits stopped and added (this alert's included) and other alerts closed. */
data class ImpactCounts(
    val hitsStopped: Int,
    val hitsAdded: Int,
    val alertsClosed: Int,
    /** Closed alerts by their triage disposition, e.g. `REVIEW_LOW` to 3. */
    val closedByDisposition: Map<String, Int>,
)

data class Impact(
    val stopsThisAlert: Boolean,
    val closesThisAlert: Boolean,
    val client: ImpactCounts,
    /** Every client the new rule covers; null for a client-layer change. */
    val company: ImpactCounts?,
)

/** The checked suggestion and, for a `rule_version`, the rule it would add and what it builds on. */
data class Checked(val suggestion: Suggestion, val draft: Draft?)

data class Draft(val definition: RuleDefinition, val base: RuleDefinition, val retires: RuleDefinition?, val clients: Set<String>)

/** The draft in the shape of the `/api/rules` POST body (without `author`), plus the version it would get. */
data class SuggestedRule(
    val key: String,
    val version: Int,
    val alertType: String,
    val layer: String,
    val scopeSegmentId: Long?,
    val scopeClientId: String?,
    val grain: String,
    val anchor: String?,
    val condition: String,
    val replacesKey: String?,
    val variables: List<VariableJson>,
    val params: Map<String, ParamJson>,
)

/** Window bounds are ISO-8601 durations, e.g. `-PT24H`; this is the flat shape the model reads and writes. */
data class SuggestedVariable(
    val position: Int,
    val name: String,
    val agg: String,
    val field: String,
    val filter: String,
    val windowKind: String,
    val windowFrom: String?,
    val windowTo: String?,
)

data class RuleRef(val key: String, val version: Int)

/** Everything the checker needs, loaded once per request. */
data class SuggestionContext(
    val alert: Alert,
    val reason: String,
    val activity: List<Activity>,
    val hitKeys: Set<String>,
    val rules: List<RuleDefinition>,
    val segments: List<Segment>,
    val clients: List<Map<String, Any?>>,
    /** The newest version, whatever its status, of each key a suggestion may write: the hit keys and their client keys. */
    val latest: Map<String, RuleDefinition>,
    /** Every value each enum-like text field takes in the data, keyed `tx.type`, `client.risk`. */
    val values: Map<String, List<String>> = emptyMap(),
    /** The alert's triage as stored: disposition, score and reasons; null before triage ran. */
    val triage: Map<String, Any?>? = null,
    /** The alert's stored AI summary text, if one was generated. */
    val summary: String? = null,
    /** Every rule version that is not retired, drafts included, so the model can see a change already exists. */
    val existingRules: List<RuleVersion> = emptyList(),
)

/** The ref the model cites for an existing rule version. */
fun RuleVersion.ref() = "existing:${rule.key}:v${rule.version}"

/** The key of the client-layer rule that replaces [key] for [clientId]; a key keeps its layer and scope across versions. */
/** The ref the model cites for the alert's client row. */
const val CLIENT_REF = "client"

const val TRIAGE_REF = "triage"

const val SUMMARY_REF = "summary"

fun clientKey(key: String, clientId: String) = "$key-$clientId"

class InvalidSuggestionException(message: String) : RuntimeException(message)
