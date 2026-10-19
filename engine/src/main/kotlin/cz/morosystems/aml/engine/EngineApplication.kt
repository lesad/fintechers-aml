package cz.morosystems.aml.engine

import cz.morosystems.aml.engine.importer.DataImporter
import cz.morosystems.aml.engine.rules.RuleService
import cz.morosystems.aml.engine.run.RunService
import cz.morosystems.aml.engine.triage.Disposition
import cz.morosystems.aml.engine.triage.TriageRepository
import cz.morosystems.aml.engine.triage.TriageService
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.WebApplicationType
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean

@SpringBootApplication
@ConfigurationPropertiesScan
class EngineApplication {
    @Bean
    fun commandRunner(
        importer: DataImporter,
        runs: RunService,
        triage: TriageService,
        triageRuns: TriageRepository,
        rules: RuleService,
    ) = ApplicationRunner { args ->
        when (args.nonOptionArgs.firstOrNull()) {
            "import" -> println(importer.import())
            "run" -> println(runs.run())
            "triage" -> {
                val runId = args.nonOptionArgs.getOrNull(1)?.toLong()
                    ?: triageRuns.latestRunId()
                    ?: error("there is no run to triage")
                val decisions = triage.triageRun(runId)
                val perDisposition = Disposition.entries.associateWith { d -> decisions.count { it.disposition == d } }
                println("run $runId: ${decisions.size} alert(s) triaged")
                perDisposition.forEach { (disposition, count) -> println("  $disposition: $count") }
            }
            "explain" -> rules.explainMissing().let { println("explanations: ${it.filled} filled, ${it.failed} failed") }
            null -> Unit
            else -> println(USAGE)
        }
    }

    private companion object {
        const val USAGE = "Usage: <import|run|triage [runId]|explain>"
    }
}

/** With a command (`import`, `run`, `triage`) the engine runs it and exits; without one it serves the HTTP API. */
fun main(args: Array<String>) {
    runApplication<EngineApplication>(*args) {
        if (args.any { !it.startsWith("--") }) setWebApplicationType(WebApplicationType.NONE)
    }
}
