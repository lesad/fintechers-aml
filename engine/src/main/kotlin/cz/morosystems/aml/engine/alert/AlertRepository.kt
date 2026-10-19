package cz.morosystems.aml.engine.alert

import java.time.OffsetDateTime
import org.springframework.jdbc.core.RowMapper
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository

data class AlertSummary(
    val id: Long,
    val runId: Long,
    val alertType: String,
    val clientId: String,
    val transactionId: String?,
    val createdAt: OffsetDateTime,
    val hits: Int,
)

@Repository
class AlertRepository(private val jdbc: JdbcClient) {
    fun latestRunId(): Long? =
        jdbc.sql("select max(id) from run where finished_at is not null").query(Long::class.java).optional().orElse(null)

    fun forRun(runId: Long): List<AlertSummary> = jdbc.sql("$SELECT where a.run_id = ? group by a.id order by a.id").param(runId).query(row).list()

    fun find(id: Long): AlertSummary? = jdbc.sql("$SELECT where a.id = ? group by a.id").param(id).query(row).optional().orElse(null)

    private val row = RowMapper { rs, _ ->
        AlertSummary(
            id = rs.getLong("id"),
            runId = rs.getLong("run_id"),
            alertType = rs.getString("alert_type"),
            clientId = rs.getString("client_id"),
            transactionId = rs.getString("transaction_id"),
            createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
            hits = rs.getInt("hits"),
        )
    }

    private companion object {
        const val SELECT =
            "select a.id, a.run_id, a.alert_type, a.client_id, a.transaction_id, a.created_at, count(ah.hit_id) as hits " +
                "from alert a left join alert_hit ah on ah.alert_id = a.id"
    }
}
