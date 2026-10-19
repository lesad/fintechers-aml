package cz.morosystems.aml.engine.importer

import cz.morosystems.aml.engine.EngineProperties
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.json.JsonMapper
import java.math.BigDecimal
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDateTime
import java.time.LocalTime

data class ImportReport(
    val clients: Int,
    val transactions: Int,
    val fxRates: Int,
    val listCodes: Int,
    val clientsWithoutQ2: Int,
    val negativeVolumes: Int,
    val emptyRequiredFields: Int,
)

internal class Row(private val cells: Map<String, String>) {
    val columns: Set<String> get() = cells.keys

    operator fun get(column: String): String = cells[column] ?: error("missing column '$column'")
}

@Component
class DataImporter(private val jdbc: JdbcClient, private val props: EngineProperties) {

    /** Replaces all imported data in one transaction; any failure leaves the previous data untouched. */
    @Transactional
    fun import(): ImportReport {
        jdbc.sql("truncate transaction, client, fx_rate, reference_list").update()
        val clientRows = readCsv(props.dataDir.resolve("CNB/clients.csv"))
        requireUnique("client", clientRows) { it["client ID"] }
        val clientIds = loadClients(clientRows)
        val fx = FxTable.parse(Files.readAllLines(props.dataDir.resolve("cnb-fx/rok-2026.txt")))
        val fxRates = loadFixings(fx)
        val transactionRows = readCsv(props.dataDir.resolve("CNB/transactions.csv"))
        requireUnique("transaction", transactionRows) { it["transaction ID"] }
        val transactions = loadTransactions(transactionRows, clientIds, fx)
        val listCodes = loadReferenceList()
        val withoutQ2 = clientRows.count { (it["real number of transactions in 2Q2026"].toIntOrNull() ?: 0) == 0 }
        val negativeVolumes = transactionRows.count { BigDecimal(it["volume"]).signum() < 0 }
        val empty = clientRows.sumOf { r -> CLIENT_REQUIRED.count { r[it].isEmpty() } } +
            transactionRows.sumOf { r -> TRANSACTION_REQUIRED.count { r[it].isEmpty() } }
        return ImportReport(clientRows.size, transactions, fxRates, listCodes, withoutQ2, negativeVolumes, empty)
    }

    private fun requireUnique(entity: String, rows: List<Row>, id: (Row) -> String) {
        val seen = HashSet<String>()
        rows.forEach { check(seen.add(id(it))) { "duplicate $entity id ${id(it)}" } }
    }

    private fun loadClients(rows: List<Row>): Set<String> {
        val values = rows.map { r ->
            val contract = Parsing.date(r["date of contract"])
            listOf(
                r["client ID"], r["country of client"], contract, r["contract concluded"], r["PEP"] == "Y",
                r["type of client"],
                Parsing.czk(r["expected volume of transactions at the time of contract conclusion [CZK]"]),
                r["expected number of transactions at the time of contract conclusion"].toIntOrNull() ?: 0,
                Parsing.czk(r["real volume of transactions in 2Q2026 [CZK]"]),
                r["real number of transactions in 2Q2026"].toIntOrNull() ?: 0,
                Parsing.czk(r["maximal volume of transaction in 2Q2026 [CZK]"]),
                Parsing.q2Days(contract), r["AML risk score"],
            )
        }
        insertBatched(
            "client (id, country, contract_date, channel, pep, type, expected_monthly_volume, expected_count, " +
                "q2_volume, q2_tx_count, q2_max_tx, q2_days, risk)",
            13, values,
        )
        return rows.mapTo(HashSet()) { it["client ID"] }
    }

    private fun loadFixings(fx: FxTable): Int {
        insertBatched("fx_rate (date, currency, quantity, rate)", 4, fx.fixings.map { listOf(it.date, it.currency, it.quantity, it.rate) })
        return fx.fixings.size
    }

    private fun loadTransactions(rows: List<Row>, clientIds: Set<String>, fx: FxTable): Int {
        val values = rows.map { r ->
            val id = r["transaction ID"]
            val clientId = r["client ID"]
            check(clientId in clientIds) { "transaction $id references unknown client $clientId" }
            val date = Parsing.date(r["date"])
            val volume = BigDecimal(r["volume"])
            val currency = r["currency"]
            val rate = try {
                fx.ratePerUnit(currency, date)
            } catch (e: IllegalStateException) {
                throw IllegalStateException("transaction $id: ${e.message}", e)
            }
            val type = r["type of transaction"]
            listOf(
                id, clientId, LocalDateTime.of(date, LocalTime.parse(r["time"])),
                toCzk(volume, rate), volume, currency, rate,
                r["country of payer"].ifEmpty { null }, r["country of payee"].ifEmpty { null },
                r["account of payer"].ifEmpty { null }, r["account of payee"].ifEmpty { null },
                type, Parsing.direction(type),
            )
        }
        insertBatched(
            "transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country, " +
                "payer_account, payee_account, type, direction)",
            13, values,
        )
        return values.size
    }

    private fun loadReferenceList(): Int {
        val root = JsonMapper().readTree(Files.readString(props.referenceList))
        val validFor = root.get("validFor").asString()
        val source = root.get("source").asString()
        val codes = root.get("countries").iterator().asSequence().map { it.get("iso2").asString() }.toList()
        insertBatched("reference_list (list, code, valid_for, source)", 4, codes.map { listOf("high_risk", it, validFor, source) })
        return codes.size
    }

    private fun insertBatched(target: String, width: Int, rows: List<List<Any?>>) {
        val placeholders = "(" + List(width) { "?" }.joinToString(", ") + ")"
        rows.chunked(BATCH).forEach { chunk ->
            jdbc.sql("insert into $target values " + List(chunk.size) { placeholders }.joinToString(", "))
                .params(chunk.flatten())
                .update()
        }
    }

    private companion object {
        const val BATCH = 2000
        val CLIENT_REQUIRED = listOf("client ID", "country of client", "date of contract", "contract concluded", "PEP", "type of client", "AML risk score")
        val TRANSACTION_REQUIRED = listOf(
            "transaction ID", "client ID", "date", "time", "volume", "currency",
            "country of payer", "country of payee", "type of transaction",
        )
    }
}

/** A ČNB CSV: `;`-separated, a header row (a BOM before it is dropped), one [Row] per non-blank line. */
internal fun readCsv(path: Path): List<Row> {
    val lines = Files.readAllLines(path).filter { it.isNotBlank() }
    require(lines.isNotEmpty()) { "the file is empty" }
    val header = lines.first().removePrefix("\uFEFF").split(';').map { it.trim() }
    return lines.drop(1).map { line -> Row(header.zip(line.split(';', limit = header.size).map { it.trim() }).toMap()) }
}
