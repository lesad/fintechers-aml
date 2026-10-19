package cz.morosystems.aml.engine

import cz.morosystems.aml.engine.importer.DataImporter
import cz.morosystems.aml.engine.run.RunService
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
    fun commandRunner(importer: DataImporter, runs: RunService) = ApplicationRunner { args ->
        when (args.nonOptionArgs.firstOrNull()) {
            "import" -> println(importer.import())
            "run" -> println(runs.run())
            null -> Unit
            else -> println(USAGE)
        }
    }

    private companion object {
        const val USAGE = "Usage: <import|run>"
    }
}

/** With a command (`import`, `run`) the engine runs it and exits; without one it serves the HTTP API. */
fun main(args: Array<String>) {
    runApplication<EngineApplication>(*args) {
        if (args.any { !it.startsWith("--") }) setWebApplicationType(WebApplicationType.NONE)
    }
}
