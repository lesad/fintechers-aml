package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.rules.Grain
import java.nio.file.Path

data class Hit(
    val id: Long,
    val ruleId: Long,
    val ruleKey: String,
    val ruleVersion: Int,
    val alertType: String,
    val clientId: String,
    val grainKey: String,
    val grain: Grain,
    val evidence: Map<String, Any?>,
)

data class AlertDraft(val alertType: String, val clientId: String, val transactionId: String?, val hits: List<Hit>)

data class RunReport(val runId: Long, val hitsPerRule: Map<String, Int>, val alertsPerType: Map<String, Int>, val csv: Path)
