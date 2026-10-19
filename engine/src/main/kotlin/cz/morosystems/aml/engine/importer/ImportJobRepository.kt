package cz.morosystems.aml.engine.importer

import java.time.OffsetDateTime
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository

/** One uploaded file and how far it got. `status` is null while it runs. */
data class ImportJob(
    val id: Long,
    val fileName: String,
    val fileSize: Long,
    /** Name of the user who uploaded it. */
    val by: String?,
    val startedAt: OffsetDateTime,
    val finishedAt: OffsetDateTime?,
    /** `VALIDATE`, `IMPORT`, `RUN`, `DONE` or `FAILED`. */
    val stage: String,
    /** `COMPLETED`, `PARTIAL` (some rows rejected) or `FAILED`; null while running. */
    val status: String?,
    val rowsTotal: Int?,
    val rowsImported: Int,
    val rowsRejected: Int,
    /** Alerts the rule run raised that the run before it had not. */
    val alerts: Int?,
    val note: String?,
)

@Repository
class ImportJobRepository(private val jdbc: JdbcClient) {
    fun create(fileName: String, fileSize: Long, userId: Long): Long =
        jdbc.sql("insert into import_job (file_name, file_size, user_id, stage) values (?, ?, ?, 'VALIDATE') returning id")
            .params(fileName, fileSize, userId).query(Long::class.java).single()

    fun stage(id: Long, stage: String, rowsTotal: Int? = null) {
        jdbc.sql("update import_job set stage = ?, rows_total = coalesce(?::int, rows_total) where id = ?").params(listOf(stage, rowsTotal, id)).update()
    }

    fun progress(id: Long, rowsImported: Int) {
        jdbc.sql("update import_job set rows_imported = ? where id = ?").params(rowsImported, id).update()
    }

    fun finish(id: Long, rowsRejected: Int, alerts: Int, note: String?) {
        jdbc.sql("update import_job set stage = 'DONE', finished_at = now(), rows_rejected = ?, alerts = ?, note = ? where id = ?")
            .params(listOf(rowsRejected, alerts, note, id)).update()
    }

    fun fail(id: Long, note: String) {
        jdbc.sql("update import_job set stage = 'FAILED', finished_at = now(), note = ? where id = ?").params(note, id).update()
    }

    fun running(): Boolean =
        jdbc.sql("select exists (select 1 from import_job where stage not in ('DONE', 'FAILED'))").query(Boolean::class.java).single()

    /** A job that was running when the engine stopped will never finish: mark it failed. */
    fun failInterrupted() {
        jdbc.sql("update import_job set stage = 'FAILED', finished_at = now(), note = 'the engine stopped during the import' where stage not in ('DONE', 'FAILED')").update()
    }

    fun find(id: Long): ImportJob? = jdbc.sql("$SELECT where j.id = ?").param(id).query(::row).optional().orElse(null)

    fun latest(limit: Int): List<ImportJob> = jdbc.sql("$SELECT order by j.id desc limit ?").param(limit).query(::row).list()

    private fun row(rs: java.sql.ResultSet, @Suppress("UNUSED_PARAMETER") n: Int): ImportJob {
        val stage = rs.getString("stage")
        val rejected = rs.getInt("rows_rejected")
        return ImportJob(
            id = rs.getLong("id"),
            fileName = rs.getString("file_name"),
            fileSize = rs.getLong("file_size"),
            by = rs.getString("by"),
            startedAt = rs.getObject("started_at", OffsetDateTime::class.java),
            finishedAt = rs.getObject("finished_at", OffsetDateTime::class.java),
            stage = stage,
            status = when (stage) {
                "FAILED" -> "FAILED"
                "DONE" -> if (rejected > 0) "PARTIAL" else "COMPLETED"
                else -> null
            },
            rowsTotal = rs.getObject("rows_total") as Int?,
            rowsImported = rs.getInt("rows_imported"),
            rowsRejected = rejected,
            alerts = rs.getObject("alerts") as Int?,
            note = rs.getString("note"),
        )
    }

    private companion object {
        const val SELECT = "select j.*, u.name as by from import_job j left join app_user u on u.id = j.user_id"
    }
}
