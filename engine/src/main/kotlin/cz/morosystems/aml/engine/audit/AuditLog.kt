package cz.morosystems.aml.engine.audit

import java.time.OffsetDateTime
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper

/** One step taken on an alert (Decree §18(3): who, when, result, inputs, reason). Its id is what a summary cites. */
data class AuditEntry(
    val id: Long,
    val alertId: Long,
    val at: OffsetDateTime,
    val actor: String,
    val step: String,
    val result: String,
    val inputs: Any?,
    val reason: String?,
)

data class NewAuditEntry(
    val alertId: Long,
    val actor: String,
    val step: String,
    val result: String,
    val inputs: Any?,
    val reason: String?,
)

/** Append-only record of every step on an alert; components add lines, nothing updates or deletes them. */
@Repository
class AuditLog(private val jdbc: JdbcClient) {
    private val json = JsonMapper()

    fun append(entry: NewAuditEntry): Long = appendAll(listOf(entry)).single()

    fun appendAll(entries: List<NewAuditEntry>): List<Long> =
        entries.chunked(BATCH).flatMap { chunk ->
            val values = chunk.joinToString(", ") { "(?, ?, ?, ?, ?::jsonb, ?)" }
            val params = chunk.flatMap { listOf(it.alertId, it.actor, it.step, it.result, json.writeValueAsString(it.inputs), it.reason) }
            jdbc.sql("insert into audit_entry (alert_id, actor, step, result, inputs, reason) values $values returning id")
                .params(params).query(Long::class.java).list().filterNotNull()
        }

    fun forAlert(alertId: Long): List<AuditEntry> =
        jdbc.sql("select id, alert_id, at, actor, step, result, inputs::text, reason from audit_entry where alert_id = ? order by id")
            .param(alertId)
            .query { rs, _ ->
                AuditEntry(
                    id = rs.getLong(1),
                    alertId = rs.getLong(2),
                    at = rs.getObject(3, OffsetDateTime::class.java),
                    actor = rs.getString(4),
                    step = rs.getString(5),
                    result = rs.getString(6),
                    inputs = rs.getString(7)?.let { json.readValue(it, Any::class.java) },
                    reason = rs.getString(8),
                )
            }.list()

    private companion object {
        const val BATCH = 2_000
    }
}
