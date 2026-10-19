package cz.morosystems.aml.engine.alert

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/alerts")
class AlertController(private val alerts: AlertRepository) {
    /** Alerts of one run, the latest finished run by default. */
    @GetMapping
    fun list(@RequestParam runId: Long?): List<AlertSummary> = (runId ?: alerts.latestRunId())?.let(alerts::forRun) ?: emptyList()

    @GetMapping("/{id}")
    fun detail(@PathVariable id: Long): AlertSummary =
        alerts.find(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "alert $id not found")
}
