package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompiler
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class RuleResolverTest {
    private val resolver = RuleResolver(RuleCompiler())

    private val k1 = mapOf<String, Any?>("id" to "K1", "q2_volume" to 500L)
    private val k2 = mapOf<String, Any?>("id" to "K2", "q2_volume" to 200L)
    private val k3 = mapOf<String, Any?>("id" to "K3", "q2_volume" to 50L)
    private val clients = listOf(k1, k2, k3)
    private val big = Segment(1, "big", "client.q2_volume > 100")
    private val huge = Segment(2, "huge", "client.q2_volume > 400")

    private val velocity = rule("V1", Layer.COMPANY)

    @Test
    fun companyRuleAppliesToEveryClient() {
        val resolved = resolver.resolve(listOf(velocity), emptyList(), emptyList(), clients)
        assertThat(resolved.clientsByRule[velocity]).containsExactlyInAnyOrder("K1", "K2", "K3")
    }

    @Test
    fun clientRuleReplacesTheCompanyRuleForThatClientOnly() {
        val payroll = rule("V1-K1", Layer.CLIENT, scopeClientId = "K1", replacesKey = "V1")
        val resolved = resolver.resolve(listOf(velocity, payroll), emptyList(), emptyList(), clients)
        assertThat(resolved.clientsByRule[velocity]).containsExactlyInAnyOrder("K2", "K3")
        assertThat(resolved.clientsByRule[payroll]).containsExactly("K1")
    }

    @Test
    fun segmentRuleAppliesToMembersOnly() {
        val bigOnly = rule("S1", Layer.SEGMENT, scopeSegmentId = 1)
        val resolved = resolver.resolve(listOf(bigOnly), emptyList(), listOf(big), clients)
        assertThat(resolved.clientsByRule[bigOnly]).containsExactlyInAnyOrder("K1", "K2")
    }

    @Test
    fun segmentReplacementLeavesNonMembersOnTheCompanyRule() {
        val stricter = rule("V1-BIG", Layer.SEGMENT, scopeSegmentId = 1, replacesKey = "V1")
        val resolved = resolver.resolve(listOf(velocity, stricter), emptyList(), listOf(big), clients)
        assertThat(resolved.clientsByRule[velocity]).containsExactly("K3")
        assertThat(resolved.clientsByRule[stricter]).containsExactlyInAnyOrder("K1", "K2")
    }

    @Test
    fun mostSpecificParameterWins() {
        val params = listOf(
            ParamRow("V1", "limit", Layer.COMPANY, null, null, 10),
            ParamRow("V1", "limit", Layer.SEGMENT, 1, null, 7),
            ParamRow("V1", "limit", Layer.CLIENT, null, "K1", 5),
        )
        val resolved = resolver.resolve(listOf(velocity), params, listOf(big), clients)
        assertThat(resolved.params("V1", "K1")).isEqualTo(mapOf("limit" to 5L))
        assertThat(resolved.params("V1", "K2")).isEqualTo(mapOf("limit" to 7L))
        assertThat(resolved.params("V1", "K3")).isEqualTo(mapOf("limit" to 10L))
    }

    @Test
    fun twoSegmentsSettingTheSameParameterForOneClientFail() {
        val params = listOf(
            ParamRow("V1", "limit", Layer.SEGMENT, 1, null, 7),
            ParamRow("V1", "limit", Layer.SEGMENT, 2, null, 6),
        )
        assertThatThrownBy { resolver.resolve(listOf(velocity), params, listOf(big, huge), clients) }
            .isInstanceOf(ConfigurationException::class.java)
            .hasMessageContaining("K1").hasMessageContaining("big").hasMessageContaining("huge")
    }

    @Test
    fun aParameterWithoutADefaultForSomeClientFailsNamingRuleAndParameter() {
        val params = listOf(ParamRow("V1", "limit", Layer.CLIENT, null, "K1", 5))
        assertThatThrownBy { resolver.resolve(listOf(velocity), params, emptyList(), clients) }
            .isInstanceOf(ConfigurationException::class.java)
            .hasMessageContaining("V1").hasMessageContaining("limit").hasMessageContaining("K2")
    }

    @Test
    fun replacingAnUnknownRuleFails() {
        val orphan = rule("X-K1", Layer.CLIENT, scopeClientId = "K1", replacesKey = "NOPE")
        assertThatThrownBy { resolver.resolve(listOf(velocity, orphan), emptyList(), emptyList(), clients) }
            .isInstanceOf(ConfigurationException::class.java)
            .hasMessageContaining("NOPE")
    }

    private fun rule(key: String, layer: Layer, scopeSegmentId: Long? = null, scopeClientId: String? = null, replacesKey: String? = null) =
        RuleDefinition(key.hashCode().toLong(), key, 1, "A", layer, scopeSegmentId, scopeClientId, Grain.TRANSACTION, null, "true", replacesKey, emptyList())
}
