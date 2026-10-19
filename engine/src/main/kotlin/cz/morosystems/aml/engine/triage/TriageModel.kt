package cz.morosystems.aml.engine.triage

import java.time.LocalDate

/**
 * What happens to an alert, ordered by severity. A floor may only move a decision **later** in this list,
 * never earlier, so `maxOf` over the ordinal is the only way a disposition is ever revised.
 */
enum class Disposition { AUTO_CLOSE, REVIEW_LOW, REVIEW_MEDIUM, REVIEW_HIGH, ESCALATE }

/** One rule hit as triage sees it: which rule fired, on which grain, with the evidence the run recorded. */
data class TriagedHit(val ruleKey: String, val ruleVersion: Int, val grainKey: String, val evidence: Map<String, Any?>)

/** The client facts triage scores. Plain values only — triage never reads the database. */
data class ClientFacts(
    val id: String,
    val risk: String?,
    val pep: Boolean?,
    val country: String?,
    val channel: String?,
    val contractDate: LocalDate?,
    val type: String?,
)

/**
 * Everything one decision is made from. Immutable and self-contained: no clock, no connection, no list lookup
 * happens inside the decision, so the same input always yields the same output.
 *
 * @param asOf the run period's end, the date relationship length is measured against. Never `now()`.
 * @param amountMinor the alert's amount in haléře (CZK x 100), or null when the alert is not transaction-bound.
 * @param otherAlertTypesOnClient alert types **other than this one** raised on the same client in the same run.
 * @param priorReports count of earlier filings for this client. No such data exists yet; the engine passes 0.
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
    val amountMinor: Long?,
    val otherAlertTypesOnClient: Set<String>,
    val priorReports: Int,
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
            "type" to client.type,
        ),
        "counterpartyCountries" to counterpartyCountries,
        "amountMinor" to amountMinor,
        "otherAlertTypesOnClient" to otherAlertTypesOnClient,
        "priorReports" to priorReports,
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
