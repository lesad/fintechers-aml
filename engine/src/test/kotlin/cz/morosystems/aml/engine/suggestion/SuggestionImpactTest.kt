package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.cel.RuleCompiler
import cz.morosystems.aml.engine.run.ClientRepository
import cz.morosystems.aml.engine.run.RuleEvaluator
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.jdbc.core.simple.JdbcClient

class SuggestionImpactTest {
    private fun impact(properties: SuggestionProperties) =
        SuggestionImpact(mock(JdbcClient::class.java), mock(RuleEvaluator::class.java), RuleCompiler(), mock(ClientRepository::class.java), properties)

    private val closesHighAlert = Impact(
        stopsThisAlert = true,
        closesThisAlert = false,
        client = ImpactCounts(1, 0, 0, emptyMap()),
        company = ImpactCounts(40, 0, 3, mapOf("REVIEW_HIGH" to 2, "REVIEW_LOW" to 1)),
    )

    @Test
    fun `declines a change that closes alerts triaged high`() {
        assertThat(impact(SuggestionProperties()).declineReason(closesHighAlert))
            .isEqualTo("The change would also close 2 other alerts that triage rated high or escalated.")
    }

    @Test
    fun `lets a change close alerts triaged high when risky closures are allowed`() {
        assertThat(impact(SuggestionProperties(declineRiskyClosures = false)).declineReason(closesHighAlert)).isNull()
    }
}
