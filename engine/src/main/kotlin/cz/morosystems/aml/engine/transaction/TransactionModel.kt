package cz.morosystems.aml.engine.transaction

import cz.morosystems.aml.engine.user.AppUser
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime

// All amounts are in CZK, as stored.

/** A transaction the latest finished run raised at least one alert on: one row of the review queue. */
data class FlaggedTransaction(
    val id: String,
    val clientId: String,
    val ts: LocalDateTime,
    val amount: Double,
    /** The amount in its original currency. */
    val volume: BigDecimal,
    val currency: String,
    /** `in`, `out` or `unknown` (remittance). */
    val direction: String,
    /** Alert types on this transaction, e.g. `["A", "B"]`. */
    val alertTypes: List<String>,
    /** Rules that fired, by key. */
    val rules: List<RuleRef>,
    /** `High`, `Medium` or `Low`, from [disposition]. */
    val rating: String,
    /** `High`, `Medium` or `Low` from the AI Rating of the most severe alert; null when it has no current ready result. */
    val aiRating: String? = null,
    /** The most severe triage disposition of the transaction's alerts, e.g. `REVIEW_HIGH`. */
    val disposition: String,
    /** The highest triage score of the transaction's alerts. */
    val score: Int,
    /** Where the case stands: the most advanced status of its alerts (`NEW` < `FALSE_POSITIVE` < `ESCALATED` < `REPORTED`). */
    val status: String,
    /** When the first alert on this transaction was created. */
    val flaggedAt: OffsetDateTime,
)

/** A rule by key and its human-readable name (the key when the rule has no name). */
data class RuleRef(val key: String, val name: String)

data class TransactionPage(
    val items: List<FlaggedTransaction>,
    val page: Int,
    val size: Int,
    /** Rows matching the filters, across all pages. */
    val total: Long,
    /** Transactions in the queue per rating, ignoring every filter but the assignee. */
    val countsByRating: Map<String, Long>,
)

data class Transaction(
    val id: String,
    val clientId: String,
    val ts: LocalDateTime,
    val amount: Double,
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
    val expectedMonthly: Double,
    val expectedCount: Int,
    val q2Volume: Double,
    val q2TxCount: Int,
    val q2MaxTx: Double,
    val q2Days: Int,
)

/** One rule firing, with every variable and parameter it evaluated. */
data class Hit(val rule: String, val name: String, val version: Int, val grainKey: String, val evidence: Map<String, Any?>)

/** One line of a triage score: the reasons sum to the score. */
data class TriageReason(val code: String, val description: String, val points: Int)

/** What triage decided for one alert (table `alert_triage`). */
data class AlertTriage(
    val disposition: String,
    val score: Int,
    val reasons: List<TriageReason>,
    val configVersion: String,
    val decidedAt: OffsetDateTime?,
)

data class TransactionAlert(
    val id: Long,
    val alertType: String,
    val createdAt: OffsetDateTime,
    /** Null when the alert has not been triaged. */
    val triage: AlertTriage?,
    /** `High`, `Medium` or `Low` from the triage disposition; null when the alert has not been triaged. */
    val rating: String?,
    /** `NEW`, `ESCALATED`, `FALSE_POSITIVE` or `REPORTED`. */
    val status: String,
    val hits: List<Hit>,
)

/** One of the client's transactions, with the alert types the latest run raised on it (empty when none). */
data class HistoryTransaction(
    val id: String,
    val ts: LocalDateTime,
    val direction: String,
    val counterpartyAccount: String?,
    val counterpartyCountry: String?,
    val amount: Double,
    val alertTypes: List<String>,
)

data class TransactionDetail(
    val transaction: Transaction,
    val client: Client,
    /** From [disposition]; null when the latest run raised no triaged alert on this transaction. */
    val rating: String?,
    /** The most severe triage disposition of its alerts; `AUTO_CLOSE` means triage closed it without a person. */
    val disposition: String?,
    /** The most advanced status of its alerts, as in the queue; null when the latest run raised none. */
    val status: String?,
    /** Who works the case; null when the latest run raised no alert on it or it was never routed. */
    val assignee: AppUser?,
    /** The case's decision log, newest first. */
    val log: List<CaseEvent>,
    val alerts: List<TransactionAlert>,
    /** The client's transactions on this transaction's day, newest first (it among them): the money flow. */
    val day: List<HistoryTransaction>,
    /** All of the client's transactions; `GET /api/transactions/{id}/history` pages through them. */
    val historyCount: Int,
)

/**
 * One step in a case's decision log (table `case_event`).
 *
 * @property action `ASSIGNED`, `REASSIGNED`, or the status a decision set (`ESCALATED`, `FALSE_POSITIVE`, `REPORTED`, `NEW`)
 * @property actor the user's name; null when the engine took the step on its own (routing at triage)
 * @property assignee who works the case after this step
 */
data class CaseEvent(
    val at: OffsetDateTime,
    val action: String,
    val actor: String?,
    val reason: String?,
    val assignee: String?,
    /** On a report: whether the client's order is held under §20; null on every other event. */
    val postponed: Boolean? = null,
)

/** A batch of the client's transactions next to another one, newest first. */
data class HistoryPage(val items: List<HistoryTransaction>, val more: Boolean)
