package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.bedrock.BedrockException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
@Import(FakeTextBedrockConfig::class)
class RuleServiceTest {
    @Autowired
    lateinit var service: RuleService

    @Autowired
    lateinit var repository: RuleRepository

    @Autowired
    lateinit var jdbc: JdbcClient

    @Autowired
    lateinit var bedrock: FakeTextBedrock

    @BeforeEach
    fun seededOnly() {
        jdbc.resetRules()
        bedrock.failure = null
        bedrock.calls = 0
    }

    @Test
    fun fillsOnlyMissingExplanations() {
        bedrock.reply = "Flags every seeded rule."
        assertThat(service.explainMissing()).isEqualTo(ExplainReport(filled = 7, failed = 0))
        assertThat(repository.allVersions().map { it.explanation }).containsOnly("Flags every seeded rule.")

        val callsAfterBackfill = bedrock.calls
        assertThat(service.explainMissing()).isEqualTo(ExplainReport(filled = 0, failed = 0))
        assertThat(bedrock.calls).isEqualTo(callsAfterBackfill)
    }

    @Test
    fun countsFailures() {
        bedrock.failure = BedrockException("The SSO session has expired")
        assertThat(service.explainMissing()).isEqualTo(ExplainReport(filled = 0, failed = 7))
        assertThat(repository.allVersions().map { it.explanation }).containsOnlyNulls()
    }
}
