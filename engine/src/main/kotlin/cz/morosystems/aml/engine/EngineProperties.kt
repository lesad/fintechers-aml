package cz.morosystems.aml.engine

import org.springframework.boot.context.properties.ConfigurationProperties
import java.nio.file.Path

/** Filesystem locations the engine reads and writes, relative to the `engine/` working directory by default. */
@ConfigurationProperties("engine")
data class EngineProperties(
    val dataDir: Path = Path.of("../data/raw"),
    val referenceList: Path = Path.of("../reference/high-risk-countries-2026-07.json"),
    val outDir: Path = Path.of("../data/out"),
    /** Dev only: when set, the rule suggestion reads its prompt from here on every call, so a prompt edit needs no restart. */
    val promptsDir: Path? = null,
)
