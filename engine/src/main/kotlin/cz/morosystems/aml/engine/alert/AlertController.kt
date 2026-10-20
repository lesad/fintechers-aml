package cz.morosystems.aml.engine.alert

import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/alerts")
class AlertController(private val alerts: AlertRepository, private val csv: AlertCsv) {
    /** Alerts of one run, the latest finished run by default. */
    @GetMapping
    fun list(@RequestParam runId: Long?): List<Alert> = (runId ?: alerts.latestRunId())?.let(alerts::forRun) ?: emptyList()

    /** The FINREG alert CSV of one run, the latest finished run by default, as a download. */
    @GetMapping("/export.csv")
    fun export(@RequestParam runId: Long?, response: HttpServletResponse) {
        val run = runId ?: alerts.latestRunId() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "no finished run")
        response.contentType = "text/csv; charset=UTF-8"
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"alerts-$run.csv\"")
        csv.write(run, response.writer)
    }

    @GetMapping("/{id}")
    fun detail(@PathVariable id: Long): Alert =
        alerts.find(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "alert $id not found")
}
