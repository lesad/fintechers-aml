package cz.morosystems.aml.engine.summary

import java.time.OffsetDateTime
import org.springframework.jdbc.core.RowMapper
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper

/** A sentence of the summary and the activity refs it rests on. */
data class Sentence(val text: String, val refs: List<String>)

data class Summary(
    val id: Long,
    val alertId: Long,
    val text: String,
    val sentences: List<Sentence>,
    val modelId: String,
    val promptHash: String,
    val createdAt: OffsetDateTime,
)

/** Every generation adds a row; the newest one is the alert's current summary. */
@Repository
class SummaryRepository(private val jdbc: JdbcClient) {
    private val json = JsonMapper()

    fun save(alertId: Long, sentences: List<Sentence>, modelId: String, promptHash: String): Summary =
        jdbc.sql(
            "insert into alert_summary (alert_id, text, sentences, model_id, prompt_hash) values (?, ?, ?::jsonb, ?, ?) returning $COLUMNS",
        ).params(alertId, sentences.joinToString(" ") { it.text }, json.writeValueAsString(sentences), modelId, promptHash)
            .query(row).single()

    fun latest(alertId: Long): Summary? =
        jdbc.sql("select $COLUMNS from alert_summary where alert_id = ? order by id desc limit 1").param(alertId).query(row).optional().orElse(null)

    private val row = RowMapper { rs, _ ->
        Summary(
            id = rs.getLong("id"),
            alertId = rs.getLong("alert_id"),
            text = rs.getString("text"),
            sentences = sentencesOf(json.readValue(rs.getString("sentences"), List::class.java)),
            modelId = rs.getString("model_id"),
            promptHash = rs.getString("prompt_hash"),
            createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
        )
    }

    private companion object {
        const val COLUMNS = "id, alert_id, text, sentences::text as sentences, model_id, prompt_hash, created_at"
    }
}
