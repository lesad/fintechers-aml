package cz.morosystems.aml.engine.triage

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Triages a finished run: one decision per alert, written to `alert_triage`.
 *
 * The only moving part is the data — the config is loaded once, the high-risk list comes from `reference_list`,
 * and the date relationships are measured against is the run's own period end. Nothing reads a clock, so running
 * the same run twice produces the same hashes and the same verdicts.
 */
@Service
class TriageService(private val repository: TriageRepository) {
    @Transactional
    fun triageRun(runId: Long): List<TriageDecision> {
        val config = TriageConfig.load().copy(highRiskCountries = repository.highRiskCountries())
        // The run's period end is exclusive; the last day actually covered is the day before it.
        val asOf = (repository.periodTo(runId) ?: error("run $runId not found, or it has no period")).minusDays(1)

        val alerts = repository.alertsOfRun(runId).sortedBy { it.id }
        val clients = repository.clientFacts()
        val countries = repository.counterpartyCountries(runId)
        val typesByClient = alerts.groupBy({ it.clientId }, { it.alertType }).mapValues { it.value.toSet() }

        val decisions = alerts.map { alert ->
            val input = TriageInput(
                alertId = alert.id,
                alertType = alert.alertType,
                clientId = alert.clientId,
                transactionId = alert.transactionId,
                asOf = asOf,
                hits = alert.hits,
                // A client the alert names but the client table does not know is missing data, not a crash:
                // the missing-data floor is exactly what takes over from here.
                client = clients[alert.clientId]
                    ?: ClientFacts(alert.clientId, null, null, null, null, null, null, null, null, null),
                counterpartyCountries = countries[alert.id].orEmpty(),
                amount = amount(alert),
                otherAlertTypesOnClient = typesByClient[alert.clientId].orEmpty() - alert.alertType,
            )
            Triage.decide(input, config)
        }
        repository.save(decisions)
        return decisions
    }

    /** The largest amount the alert's hits evidence, in CZK: a transaction amount, else a day's volume. */
    private fun amount(alert: TriageAlert): Double? =
        alert.hits.mapNotNull { hit ->
            (hit.evidence["tx.amount"] ?: hit.evidence["day_volume"]).let { it as? Number }?.toDouble()
        }.maxOrNull()
}
