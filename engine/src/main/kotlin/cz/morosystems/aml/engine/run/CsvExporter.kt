package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.triage.TriageDecision
import java.nio.file.Files
import java.nio.file.Path
import tools.jackson.databind.json.JsonMapper

/** Writes the alerts CSV: the challenge's first columns, the triage verdict, and each alert's hit evidence as JSON. */
object CsvExporter {
    private val json = JsonMapper()

    fun write(path: Path, alerts: List<Pair<Long, AlertDraft>>, decisions: Map<Long, TriageDecision>) {
        Files.createDirectories(path.parent)
        Files.newBufferedWriter(path).use { out ->
            out.write("alert_id,disposition,score,alert_type,client_id,transaction_id,evidence\n")
            alerts.forEach { (id, alert) ->
                val evidence = alert.hits.map { mapOf("rule" to it.ruleKey, "grain_key" to it.grainKey) + it.evidence }
                val triage = decisions[id]
                out.write(
                    listOf(
                        id.toString(),
                        triage?.disposition?.name.orEmpty(),
                        triage?.score?.toString().orEmpty(),
                        alert.alertType,
                        alert.clientId,
                        alert.transactionId.orEmpty(),
                        json.writeValueAsString(evidence),
                    ).joinToString(",") { quote(it) },
                )
                out.write("\n")
            }
        }
    }

    private fun quote(field: String) =
        if (field.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) "\"" + field.replace("\"", "\"\"") + "\"" else field
}
