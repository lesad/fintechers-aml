package cz.morosystems.aml.engine.importer

import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.assertj.MockMvcTester

/** The data import page's engine side: upload, the background run, the history and the reset. */
@PostgresTest
@AutoConfigureMockMvc
class ImportControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Autowired
    lateinit var jdbc: JdbcClient

    private var user = 0L

    @BeforeEach
    fun data() {
        jdbc.sql("truncate run, transaction, client, import_job cascade").update()
        jdbc.sql(
            """
            insert into client (id, country, contract_date, pep, type, channel, risk, expected_monthly_volume, q2_volume, q2_tx_count, q2_max_tx, q2_days)
            values ('K1', 'CZ', '2026-06-01', true, 'legal entity', 'in person', 'low', 100000000, 0, 0, 0, 91)
            """,
        ).update()
        user = jdbc.sql("select min(id) from app_user").query(Long::class.java).single()
    }

    @Test
    fun loadsTheFileOverwritesKnownIdsRejectsUnknownClientsAndRunsTheRules() {
        val job = upload(
            csv(
                "U1;K1;10.07.2026;09:00:00;1000.00;CZK;CZ;CZ;K1;ACZ1;outgoing payment",
                "U1;K1;10.07.2026;09:00:00;150000.00;CZK;CZ;CZ;K1;ACZ9;outgoing payment",
                "U2;K9;10.07.2026;10:00:00;500.00;CZK;CZ;CZ;K9;ACZ2;outgoing payment",
            ),
        )
        assertThat(job["status"]).isEqualTo("PARTIAL")
        assertThat(job["rowsImported"]).isEqualTo(1)
        assertThat(job["rowsRejected"]).isEqualTo(1)
        assertThat(job["note"] as String).contains("unknown client (1)")
        assertThat(amount("U1")).isEqualTo(150_000.0)
        // A PEP's 150,000 CZK outgoing payment is over B2's limit: the run raised an alert on it.
        assertThat(job["alerts"] as Int).isPositive()

        // A manager reported it; the same file again keeps that, raises nothing new and overwrites the amount.
        val manager = jdbc.sql("select id from app_user where role = 'MANAGER'").query(Long::class.java).single()
        jdbc.sql("update alert set status = 'REPORTED', assignee_id = ? where transaction_id = 'U1'").param(manager).update()
        jdbc.sql(
            "insert into case_event (run_id, transaction_id, actor_id, action, reason) select max(id), 'U1', ?, 'REPORTED', 'layering' from run",
        ).param(manager).update()
        val again = upload(csv("U1;K1;10.07.2026;09:00:00;160000.00;CZK;CZ;CZ;K1;ACZ9;outgoing payment"))
        assertThat(again["status"]).isEqualTo("COMPLETED")
        assertThat(again["alerts"]).isEqualTo(0)
        assertThat(amount("U1")).isEqualTo(160_000.0)
        val latest = jdbc.sql("select status from alert where transaction_id = 'U1' and run_id = (select max(id) from run)")
            .query(String::class.java).list()
        assertThat(latest).isNotEmpty().allMatch { it == "REPORTED" }
        val assignees = jdbc.sql("select distinct assignee_id from alert where transaction_id = 'U1' and run_id = (select max(id) from run)")
            .query(Long::class.java).list()
        assertThat(assignees).containsExactly(manager)
        val log = jdbc.sql("select action from case_event where transaction_id = 'U1' and run_id = (select max(id) from run) order by id")
            .query(String::class.java).list()
        assertThat(log).endsWith("REPORTED")

        assertThat(mvc.get().uri("/api/imports")).hasStatusOk().bodyJson().extractingPath("$[*].status").asArray()
            .containsExactly("COMPLETED", "PARTIAL")
    }

    @Test
    fun aFileWithoutAColumnFailsWithTheReason() {
        val job = upload("transaction ID;client ID\nU1;K1\n")
        assertThat(job["status"]).isEqualTo("FAILED")
        assertThat(job["note"] as String).contains("missing column")
    }

    @Test
    fun anUploadNeedsAKnownUser() {
        val file = MockMultipartFile("file", "tx.csv", "text/csv", csv().toByteArray())
        assertThat(mvc.post().uri("/api/imports").multipart().file(file)).hasStatus(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun theResetDeletesTransactionsAndAlertsButKeepsClientsAndHistory() {
        upload(csv("U1;K1;10.07.2026;09:00:00;150000.00;CZK;CZ;CZ;K1;ACZ9;outgoing payment"))
        assertThat(mvc.delete().uri("/api/data").header("X-User-Id", user)).hasStatus(HttpStatus.NO_CONTENT)

        assertThat(count("transaction")).isZero()
        assertThat(count("alert")).isZero()
        assertThat(count("client")).isEqualTo(1)
        assertThat(count("import_job")).isEqualTo(1)
    }

    private fun csv(vararg rows: String) =
        "﻿transaction ID;client ID;date;time;volume;currency;country of payer;country of payee;account of payer;account of payee;type of transaction\n" +
            rows.joinToString("\n")

    /** Uploads [content] and waits for the background job to finish; returns the finished job as JSON fields. */
    private fun upload(content: String): Map<String, Any?> {
        val file = MockMultipartFile("file", "tx.csv", "text/csv", content.toByteArray())
        val result = mvc.post().uri("/api/imports").multipart().file(file).header("X-User-Id", user).exchange()
        assertThat(result).hasStatus(HttpStatus.ACCEPTED)
        val id = Regex("\"id\":(\\d+)").find(result.response.contentAsString)!!.groupValues[1].toLong()
        repeat(300) {
            val row = jdbc.sql("select stage, rows_imported, rows_rejected, alerts, note from import_job where id = ?").param(id)
                .query { rs, _ ->
                    mapOf(
                        "stage" to rs.getString("stage"),
                        "rowsImported" to rs.getInt("rows_imported"),
                        "rowsRejected" to rs.getInt("rows_rejected"),
                        "alerts" to rs.getObject("alerts"),
                        "note" to rs.getString("note"),
                    )
                }.single()
            when (row["stage"]) {
                "FAILED" -> return row + ("status" to "FAILED")
                "DONE" -> return row + ("status" to if (row["rowsRejected"] == 0) "COMPLETED" else "PARTIAL")
            }
            Thread.sleep(100)
        }
        error("import $id did not finish")
    }

    private fun amount(id: String) =
        jdbc.sql("select amount from transaction where id = ?").param(id).query(Double::class.java).single()

    private fun count(table: String) = jdbc.sql("select count(*) from $table").query(Long::class.java).single()
}
