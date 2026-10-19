package cz.morosystems.aml.engine.importer

import java.math.BigDecimal
import java.nio.file.Path
import java.time.LocalDateTime
import java.time.LocalTime
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component

/** What loading an uploaded file did: rows in the file, rows stored, rows refused and why. */
data class UploadResult(val total: Int, val imported: Int, val rejected: Int, val note: String?)

/**
 * Loads an uploaded transactions CSV in the ČNB format on top of the stored data. A transaction id already stored is
 * overwritten with the file's values (within a file, the last row for an id wins). Clients are not uploaded, so a row
 * for an unknown client is refused, as is one in a currency without a ČNB fixing or one that does not parse.
 */
@Component
class TransactionUpload(private val jdbc: JdbcClient) {

    /** The file's rows; a missing column fails the whole file. */
    internal fun read(path: Path): List<Row> {
        val rows = readCsv(path)
        val missing = COLUMNS - (rows.firstOrNull()?.columns ?: COLUMNS)
        require(missing.isEmpty()) { "missing column ${missing.joinToString(", ")}" }
        return rows
    }

    /** Stores the rows in batches, reporting the rows stored so far after each one. */
    internal fun load(rows: List<Row>, progress: (Int) -> Unit): UploadResult {
        val clients = jdbc.sql("select id from client").query(String::class.java).list().filterNotNullTo(HashSet())
        // The fixings the full import stored, so an upload needs no file beside it.
        val fx = FxTable.of(
            jdbc.sql("select date, currency, quantity, rate from fx_rate").query { rs, _ ->
                Fixing(rs.getObject("date", java.time.LocalDate::class.java), rs.getString("currency"), rs.getInt("quantity"), rs.getBigDecimal("rate"))
            }.list(),
        )
        val reasons = mutableMapOf<String, Int>()
        val values = rows.associateBy { it["transaction ID"] }.values.mapNotNull { r ->
            val refused = reasonToRefuse(r, clients)
            if (refused != null) {
                reasons.merge(refused, 1, Int::plus)
                return@mapNotNull null
            }
            try {
                values(r, fx)
            } catch (e: RuntimeException) {
                reasons.merge(if (e is IllegalStateException) "no ČNB fixing for ${r["currency"]}" else "unreadable row", 1, Int::plus)
                null
            }
        }
        var stored = 0
        values.chunked(BATCH).forEach { chunk ->
            jdbc.sql(UPSERT_HEAD + List(chunk.size) { PLACEHOLDERS }.joinToString(", ") + UPSERT_TAIL)
                .params(chunk.flatten()).update()
            stored += chunk.size
            progress(stored)
        }
        val rejected = reasons.values.sum()
        val note = if (rejected == 0) null else "$rejected rows rejected: " + reasons.entries.joinToString(", ") { "${it.key} (${it.value})" }
        return UploadResult(rows.size, stored, rejected, note)
    }

    private fun reasonToRefuse(r: Row, clients: Set<String>): String? = when {
        REQUIRED.any { r[it].isEmpty() } -> "empty required field"
        r["type of transaction"] !in TYPES -> "unknown transaction type"
        r["client ID"] !in clients -> "unknown client"
        else -> null
    }

    private fun values(r: Row, fx: FxTable): List<Any?> {
        val date = Parsing.date(r["date"])
        val volume = BigDecimal(r["volume"])
        val rate = fx.ratePerUnit(r["currency"], date)
        val type = r["type of transaction"]
        return listOf(
            r["transaction ID"], r["client ID"], LocalDateTime.of(date, LocalTime.parse(r["time"])),
            toCzk(volume, rate), volume, r["currency"], rate,
            r["country of payer"].ifEmpty { null }, r["country of payee"].ifEmpty { null },
            r["account of payer"].ifEmpty { null }, r["account of payee"].ifEmpty { null },
            type, Parsing.direction(type),
        )
    }

    private companion object {
        const val BATCH = 2000
        val COLUMNS = setOf(
            "transaction ID", "client ID", "date", "time", "volume", "currency", "country of payer", "country of payee",
            "account of payer", "account of payee", "type of transaction",
        )
        val TYPES = setOf("incoming payment", "outgoing payment", "remittance")
        val REQUIRED = listOf("transaction ID", "client ID", "date", "time", "volume", "currency", "type of transaction")
        const val PLACEHOLDERS = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        const val UPSERT_HEAD = "insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, " +
            "payee_country, payer_account, payee_account, type, direction) values "
        const val UPSERT_TAIL = " on conflict (id) do update set client_id = excluded.client_id, ts = excluded.ts, " +
            "amount = excluded.amount, volume = excluded.volume, currency = excluded.currency, fx_rate = excluded.fx_rate, " +
            "payer_country = excluded.payer_country, payee_country = excluded.payee_country, " +
            "payer_account = excluded.payer_account, payee_account = excluded.payee_account, type = excluded.type, " +
            "direction = excluded.direction"
    }
}
