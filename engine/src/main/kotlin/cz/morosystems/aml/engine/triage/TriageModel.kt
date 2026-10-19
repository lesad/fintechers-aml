package cz.morosystems.aml.engine.triage

import java.time.LocalDate

/**
 * What happens to an alert, ordered by severity. A floor may only move a decision **later** in this list,
 * never earlier, so `maxOf` over the ordinal is the only way a disposition is ever revised.
 */
enum class Disposition { AUTO_CLOSE, REVIEW_LOW, REVIEW_MEDIUM, REVIEW_HIGH, ESCALATE }

/** One rule hit as triage sees it: which rule fired, on which grain, with the evidence the run recorded. */
data class TriagedHit(val ruleKey: String, val ruleVersion: Int, val grainKey: String, val evidence: Map<String, Any?>)

/**
 * The client facts triage scores. Plain values only — triage never reads the database.
 *
 * The declared volume and the Q2 counts are here only to answer whether the client can be profiled at all;
 * the rule evidence cannot answer it, because a hit records `day_volume` but never what the client declared.
 */
data class ClientFacts(
    val id: String,
    val risk: String?,
    val pep: Boolean?,
    val country: String?,
    val channel: String?,
    val contractDate: LocalDate?,
    val expectedMonthlyVolume: Double?,
    val q2Volume: Double?,
    val q2TxCount: Int?,
    val q2Days: Int?,
) {
    /**
     * True when the client cannot be profiled at all: no declared volume, or no Q2 history to compare against.
     * Such a client is not evidence of good behaviour — it is an absence of evidence, so it blocks an auto-close.
     */
    val unbaselined: Boolean
        get() = (expectedMonthlyVolume ?: 0.0) <= 0.0 || (q2Volume ?: 0.0) <= 0.0 || (q2TxCount ?: 0) <= 0 || (q2Days ?: 0) <= 0

    /** Why the client is unbaselined, for the reason line. Empty when it is not. */
    val missingBaseline: List<String>
        get() = buildList {
            if ((expectedMonthlyVolume ?: 0.0) <= 0.0) add("expected_monthly_volume")
            if ((q2Volume ?: 0.0) <= 0.0) add("q2_volume")
            if ((q2TxCount ?: 0) <= 0) add("q2_tx_count")
            if ((q2Days ?: 0) <= 0) add("q2_days")
        }
}

/**
 * Everything one decision is made from. Immutable and self-contained: no clock, no connection, no list lookup
 * happens inside the decision, so the same input always yields the same output.
 *
 * @param asOf the run period's end, the date relationship length is measured against. Never `now()`.
 * @param amount the alert's amount in CZK, or null when the alert is not transaction-bound.
 * @param otherAlertTypesOnClient alert types **other than this one** raised on the same client in the same run.
 */
data class TriageInput(
    val alertId: Long,
    val alertType: String,
    val clientId: String,
    val transactionId: String?,
    val asOf: LocalDate,
    val hits: List<TriagedHit>,
    val client: ClientFacts,
    val counterpartyCountries: Set<String>,
    val amount: Double?,
    val otherAlertTypesOnClient: Set<String>,
) {
    /**
     * The shape the input hash is taken over. Hits are sorted because the order the run happened to emit them in
     * carries no meaning — two runs that find the same hits must hash alike.
     */
    fun canonicalForm(): Map<String, Any?> = mapOf(
        "alertId" to alertId,
        "alertType" to alertType,
        "clientId" to clientId,
        "transactionId" to transactionId,
        "asOf" to asOf,
        "hits" to hits.map {
            mapOf("ruleKey" to it.ruleKey, "ruleVersion" to it.ruleVersion, "grainKey" to it.grainKey, "evidence" to it.evidence)
        }.sortedBy { CanonicalJson.render(it) },
        "client" to mapOf(
            "id" to client.id,
            "risk" to client.risk,
            "pep" to client.pep,
            "country" to client.country,
            "channel" to client.channel,
            "contractDate" to client.contractDate,
            "expectedMonthlyVolume" to client.expectedMonthlyVolume,
            "q2Volume" to client.q2Volume,
            "q2TxCount" to client.q2TxCount,
            "q2Days" to client.q2Days,
        ),
        "counterpartyCountries" to counterpartyCountries,
        "amount" to amount,
        "otherAlertTypesOnClient" to otherAlertTypesOnClient,
    )
}

/**
 * One line of the explanation. [points] is the exact contribution to the score, so the reasons always sum to it;
 * a cap or a clamp appears as its own reason with negative points rather than silently adjusting another line.
 */
data class Reason(val code: String, val description: String, val points: Int)

/** A triage outcome, explainable on its own: the reasons reconstruct the score, the hash pins the input. */
data class TriageDecision(
    val alertId: Long,
    val disposition: Disposition,
    val score: Int,
    val reasons: List<Reason>,
    val configVersion: String,
    val inputHash: String,
)
