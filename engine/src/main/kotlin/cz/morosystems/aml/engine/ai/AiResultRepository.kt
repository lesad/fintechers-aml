package cz.morosystems.aml.engine.ai

import java.time.OffsetDateTime
import org.springframework.jdbc.core.RowMapper
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper

/** Every generation adds a row, rejected and failed ones too; the newest row of a kind is the alert's current result. */
@Repository
class AiResultRepository(private val jdbc: JdbcClient) {
    private val json = JsonMapper()

    fun save(
        alertId: Long,
        kind: String,
        status: String,
        body: Any?,
        error: String?,
        modelId: String,
        promptHash: String,
        inputHash: String,
    ): AiResult =
        jdbc.sql(
            """
            insert into ai_result (alert_id, kind, status, body, error, model_id, prompt_hash, input_hash)
            values (?, ?, ?, ?::jsonb, ?, ?, ?, ?) returning $COLUMNS
            """.trimIndent(),
        ).params(listOf(alertId, kind, status, body?.let(json::writeValueAsString), error, modelId, promptHash, inputHash))
            .query(row).single()

    /** The newest result of the kind, whatever prompt made it. */
    fun latest(alertId: Long, kind: String): AiResult? =
        jdbc.sql("select $COLUMNS from ai_result where alert_id = ? and kind = ? order by id desc limit 1")
            .params(alertId, kind).query(row).optional().orElse(null)

    private val row = RowMapper { rs, _ ->
        AiResult(
            alertId = rs.getLong("alert_id"),
            kind = rs.getString("kind"),
            status = rs.getString("status"),
            body = rs.getString("body")?.let { json.readValue(it, Map::class.java) },
            error = rs.getString("error"),
            modelId = rs.getString("model_id"),
            promptHash = rs.getString("prompt_hash"),
            inputHash = rs.getString("input_hash"),
            createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
        )
    }

    private companion object {
        const val COLUMNS = "alert_id, kind, status, body::text as body, error, model_id, prompt_hash, input_hash, created_at"
    }
}
