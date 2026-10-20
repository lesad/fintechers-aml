package cz.morosystems.aml.engine.importer

import cz.morosystems.aml.engine.run.RunService
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.Executors
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service

/** Another import is still running; one at a time. */
class ImportBusyException : RuntimeException("an import is already running")

/**
 * The data import page's work: an uploaded transactions file is validated, loaded on top of the stored data and
 * followed by a rule run (with triage), one file at a time in the background. Decisions carry over: a case a person
 * decided in the run before keeps its status, assignee and decision log in the new run.
 */
@Service
class ImportService(
    private val jobs: ImportJobRepository,
    private val upload: TransactionUpload,
    private val runs: RunService,
    private val jdbc: JdbcClient,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val worker = Executors.newSingleThreadExecutor()

    @EventListener(ApplicationReadyEvent::class)
    fun failInterrupted() = jobs.failInterrupted()

    /** Stores [file] and starts processing it; returns the job at once. */
    @Synchronized
    fun start(fileName: String, file: Path, userId: Long): ImportJob {
        if (jobs.running()) throw ImportBusyException()
        val id = jobs.create(fileName, Files.size(file), userId)
        worker.submit { process(id, file) }
        return jobs.find(id)!!
    }

    /** Deletes every transaction and alert (with their runs, hits, triage and summaries); clients, rules, users and the import history stay. */
    @Synchronized
    fun deleteTransactions() {
        if (jobs.running()) throw ImportBusyException()
        jdbc.sql("truncate transaction, run cascade").update()
    }

    fun counts(): Map<String, Long> = mapOf(
        "transactions" to jdbc.sql("select count(*) from transaction").query(Long::class.java).single(),
        "alerts" to jdbc.sql("select count(*) from alert").query(Long::class.java).single(),
    )

    internal fun process(id: Long, file: Path) {
        try {
            val rows = upload.read(file)
            jobs.stage(id, "IMPORT", rowsTotal = rows.size)
            val loaded = upload.load(rows) { jobs.progress(id, it) }
            jobs.stage(id, "RUN")
            jobs.finish(id, loaded.rejected, rerun(), loaded.note)
        } catch (e: Exception) {
            log.warn("import {} failed", id, e)
            jobs.fail(id, e.message ?: e.javaClass.simpleName)
        } finally {
            Files.deleteIfExists(file)
        }
    }

    /**
     * Recalculates the alerts with the rules active now, after [rule] was approved: a new run replaces the queue's
     * alerts and keeps every decided case, as an import does. It waits for an import or recalculation already
     * running; returns the job at once.
     */
    @Synchronized
    fun recalculate(rule: String, userId: Long): ImportJob {
        val id = jobs.createRecalculation(rule, userId)
        worker.submit {
            try {
                jobs.finish(id, 0, rerun(), null)
            } catch (e: Exception) {
                log.warn("recalculation {} failed", id, e)
                jobs.fail(id, e.message ?: e.javaClass.simpleName)
            }
        }
        return jobs.find(id)!!
    }

    /** Runs the active rules into a new run and carries the decided cases over; returns how many alerts are new. */
    private fun rerun(): Int {
        val previous = jdbc.sql("select max(id) from run where finished_at is not null").query(Long::class.java).optional().orElse(null)
        return carryOver(previous, runs.run().runId)
    }

    /** Copies people's statuses from [previous] onto the alerts [runId] raised again; returns how many alerts are new. */
    private fun carryOver(previous: Long?, runId: Long): Int {
        if (previous != null) {
            // A case someone already decided keeps its status, its assignee and its decision log, in place of the
            // routing the new run's triage just gave it.
            val decided = jdbc.sql(
                """
                select distinct a.transaction_id from alert a join alert o on $SAME_ALERT
                where a.run_id = :run and o.run_id = :previous and o.status <> 'NEW' and a.transaction_id is not null
                """,
            ).param("run", runId).param("previous", previous).query(String::class.java).list().toTypedArray()
            jdbc.sql(
                """
                update alert a set status = o.status, status_by = o.status_by, assignee_id = o.assignee_id
                from alert o
                where a.run_id = :run and o.run_id = :previous and o.status <> 'NEW' and $SAME_ALERT
                """,
            ).param("run", runId).param("previous", previous).update()
            jdbc.sql("delete from case_event where run_id = ? and transaction_id = any(?)").params(runId, decided).update()
            jdbc.sql(
                """
                insert into case_event (run_id, transaction_id, at, actor_id, action, reason, assignee_id, postponed)
                select ?, transaction_id, at, actor_id, action, reason, assignee_id, postponed
                from case_event where run_id = ? and transaction_id = any(?) order by id
                """,
            ).params(runId, previous, decided).update()
        }
        return jdbc.sql(
            """
            select count(*) from alert a where a.run_id = :run
              and not exists (select 1 from alert o where o.run_id = :previous and $SAME_ALERT)
            """,
        ).param("run", runId).param("previous", previous ?: -1L).query(Int::class.java).single()
    }

    private companion object {
        /** Two runs' alerts are the same alert when they are of one type, for one client and transaction. */
        const val SAME_ALERT = "o.alert_type = a.alert_type and o.client_id = a.client_id and o.transaction_id is not distinct from a.transaction_id"
    }
}
