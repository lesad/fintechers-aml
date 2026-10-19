package cz.morosystems.aml.engine

import cz.morosystems.aml.engine.importer.DataImporter
import cz.morosystems.aml.engine.importer.ImportReport
import cz.morosystems.aml.engine.run.RunReport
import cz.morosystems.aml.engine.run.RunService
import java.nio.file.Path
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.boot.DefaultApplicationArguments
import java.io.ByteArrayOutputStream
import java.io.PrintStream

class CommandRunnerTest {
    private val importer = mock(DataImporter::class.java)
    private val runs = mock(RunService::class.java)

    private fun run(vararg args: String): String {
        val captured = ByteArrayOutputStream()
        val original = System.out
        System.setOut(PrintStream(captured, true))
        try {
            EngineApplication().commandRunner(importer, runs).run(DefaultApplicationArguments(*args))
        } finally {
            System.setOut(original)
        }
        return captured.toString()
    }

    @Test
    fun importCommandRunsImporterAndPrintsReport() {
        `when`(importer.import()).thenReturn(ImportReport(5493, 397853, 100, 12, 7, 0, 0))
        val out = run("import")
        verify(importer).import()
        assertThat(out).contains("5493").contains("397853")
    }

    @Test
    fun runCommandRunsTheRulesAndPrintsReport() {
        `when`(runs.run()).thenReturn(RunReport(7, mapOf("B2" to 112), mapOf("B" to 112), Path.of("data/out/alerts-7.csv")))
        val out = run("run")
        assertThat(out).contains("alerts-7.csv").contains("112")
    }

    @Test
    fun unknownCommandPrintsUsage() {
        val out = run("nonsense")
        verifyNoInteractions(importer, runs)
        assertThat(out).contains("Usage")
    }
}
