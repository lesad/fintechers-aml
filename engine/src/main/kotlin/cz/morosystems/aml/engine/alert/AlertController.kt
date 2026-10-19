package cz.morosystems.aml.engine.alert

import cz.morosystems.aml.engine.audit.AuditEntry
import cz.morosystems.aml.engine.audit.AuditLog
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class AlertDetail(val alert: AlertSummary, val audit: List<AuditEntry>)

@RestController
@RequestMapping("/api/alerts")
class AlertController(private val alerts: AlertRepository, private val audit: AuditLog) {
    /** Alerts of one run, the latest finished run by default. */
    @GetMapping
    fun list(@RequestParam runId: Long?): List<AlertSummary> = (runId ?: alerts.latestRunId())?.let(alerts::forRun) ?: emptyList()

    /** One alert with its audit trail, oldest entry first. */
    @GetMapping("/{id}")
    fun detail(@PathVariable id: Long): AlertDetail {
        val alert = alerts.find(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "alert $id not found")
        return AlertDetail(alert, audit.forAlert(id))
    }
}
