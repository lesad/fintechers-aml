package cz.morosystems.aml.engine

import cz.morosystems.aml.engine.importer.DataImporter
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean

@SpringBootApplication
@ConfigurationPropertiesScan
class EngineApplication {
    @Bean
    fun commandRunner(importer: DataImporter) = ApplicationRunner { args ->
        when (args.nonOptionArgs.firstOrNull()) {
            "import" -> println(importer.import())
            else -> println(USAGE)
        }
    }

    private companion object {
        const val USAGE = "Usage: <import|run>"
    }
}

fun main(args: Array<String>) {
    runApplication<EngineApplication>(*args)
}
