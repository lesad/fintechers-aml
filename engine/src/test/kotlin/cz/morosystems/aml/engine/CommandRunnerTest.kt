package cz.morosystems.aml.engine

import cz.morosystems.aml.engine.importer.DataImporter
import cz.morosystems.aml.engine.importer.ImportReport
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

    private fun run(vararg args: String): String {
        val captured = ByteArrayOutputStream()
        val original = System.out
        System.setOut(PrintStream(captured, true))
        try {
            EngineApplication().commandRunner(importer).run(DefaultApplicationArguments(*args))
        } finally {
            System.setOut(original)
        }
        return captured.toString()
    }

    @Test
    fun importCommandRunsImporterAndPrintsReport() {
        `when`(importer.import()).thenReturn(ImportReport(5493, 397853, 100, 12, 7))
        val out = run("import")
        verify(importer).import()
        assertThat(out).contains("5493").contains("397853")
    }

    @Test
    fun unknownCommandPrintsUsage() {
        val out = run("nonsense")
        verifyNoInteractions(importer)
        assertThat(out).contains("Usage")
    }
}
