package cz.morosystems.aml.engine.transaction

import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime

// All amounts are in haléře (1 CZK = 100 haléřů), as stored.

/** A transaction the latest finished run raised at least one alert on: one row of the review queue. */
data class FlaggedTransaction(
    val id: String,
    val clientId: String,
    val ts: LocalDateTime,
    val amountHalere: Long,
    /** The amount in its original currency. */
    val volume: BigDecimal,
    val currency: String,
    /** `in`, `out` or `unknown` (remittance). */
    val direction: String,
    /** Alert types on this transaction, e.g. `["A", "B"]`. */
    val alertTypes: List<String>,
    /** Rule keys that fired, e.g. `["A1", "B2"]`. */
    val rules: List<String>,
    val rating: String,
    /** When the first alert on this transaction was created. */
    val flaggedAt: OffsetDateTime,
)

data class TransactionPage(
    val items: List<FlaggedTransaction>,
    val page: Int,
    val size: Int,
    /** Rows matching the filters, across all pages. */
    val total: Long,
    /** Flagged transactions per rating, ignoring the filters. */
    val countsByRating: Map<String, Long>,
)

data class Transaction(
    val id: String,
    val clientId: String,
    val ts: LocalDateTime,
    val amountHalere: Long,
    val volume: BigDecimal,
    val currency: String,
    val fxRate: BigDecimal,
    val direction: String,
    val type: String,
    val payerAccount: String?,
    val payerCountry: String?,
    val payeeAccount: String?,
    val payeeCountry: String?,
)

data class Client(
    val id: String,
    val country: String?,
    val contractDate: LocalDate?,
    val channel: String?,
    val pep: Boolean,
    val type: String?,
    val risk: String?,
    val expectedMonthlyHalere: Long,
    val expectedCount: Int,
    val q2VolumeHalere: Long,
    val q2TxCount: Int,
    val q2MaxTxHalere: Long,
    val q2Days: Int,
)

/** One rule firing, with every variable and parameter it evaluated. */
data class Hit(val rule: String, val version: Int, val grainKey: String, val evidence: Map<String, Any?>)

data class TransactionAlert(val id: Long, val alertType: String, val createdAt: OffsetDateTime, val hits: List<Hit>)

/** One of the client's transactions, with the alert types the latest run raised on it (empty when none). */
data class HistoryTransaction(
    val id: String,
    val ts: LocalDateTime,
    val direction: String,
    val counterpartyAccount: String?,
    val counterpartyCountry: String?,
    val amountHalere: Long,
    val alertTypes: List<String>,
)

data class TransactionDetail(
    val transaction: Transaction,
    val client: Client,
    /** Null when the latest run raised no alert on this transaction. */
    val rating: String?,
    val alerts: List<TransactionAlert>,
    /** All of the client's transactions, newest first. */
    val history: List<HistoryTransaction>,
)
