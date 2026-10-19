package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompiler
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class RuleResolverTest {
    private val resolver = RuleResolver(RuleCompiler())

    private val k1 = mapOf<String, Any?>("id" to "K1", "q2_volume" to 500.0)
    private val k2 = mapOf<String, Any?>("id" to "K2", "q2_volume" to 200.0)
    private val k3 = mapOf<String, Any?>("id" to "K3", "q2_volume" to 50.0)
    private val clients = listOf(k1, k2, k3)
    private val big = Segment(1, "big", "client.q2_volume > 100.0")
    private val huge = Segment(2, "huge", "client.q2_volume > 400.0")

    private val velocity = rule("V1", Layer.COMPANY)

    @Test
    fun companyRuleAppliesToEveryClient() {
        val resolved = resolver.resolve(listOf(velocity), emptyList(), clients)
        assertThat(resolved.clientsByRule[velocity]).containsExactlyInAnyOrder("K1", "K2", "K3")
    }

    @Test
    fun clientRuleReplacesTheCompanyRuleForThatClientOnly() {
        val payroll = rule("V1-K1", Layer.CLIENT, scopeClientId = "K1", replacesKey = "V1")
        val resolved = resolver.resolve(listOf(velocity, payroll), emptyList(), clients)
        assertThat(resolved.clientsByRule[velocity]).containsExactlyInAnyOrder("K2", "K3")
        assertThat(resolved.clientsByRule[payroll]).containsExactly("K1")
    }

    @Test
    fun segmentRuleAppliesToMembersOnly() {
        val bigOnly = rule("S1", Layer.SEGMENT, scopeSegmentId = 1)
        val resolved = resolver.resolve(listOf(bigOnly), listOf(big), clients)
        assertThat(resolved.clientsByRule[bigOnly]).containsExactlyInAnyOrder("K1", "K2")
    }

    @Test
    fun segmentReplacementLeavesNonMembersOnTheCompanyRule() {
        val stricter = rule("V1-BIG", Layer.SEGMENT, scopeSegmentId = 1, replacesKey = "V1")
        val resolved = resolver.resolve(listOf(velocity, stricter), listOf(big), clients)
        assertThat(resolved.clientsByRule[velocity]).containsExactly("K3")
        assertThat(resolved.clientsByRule[stricter]).containsExactlyInAnyOrder("K1", "K2")
    }

    @Test
    fun segmentReplacementBringsItsOwnParameters() {
        val company = rule("V1", Layer.COMPANY, params = mapOf("limit" to Param(10.0, ParamUnit.MULTIPLE)))
        val stricter = rule("S1", Layer.SEGMENT, scopeSegmentId = 2, replacesKey = "V1", params = mapOf("limit" to Param(7.0, ParamUnit.MULTIPLE)))
        val resolved = resolver.resolve(listOf(company, stricter), listOf(huge), clients)
        assertThat(resolved.clientsByRule[stricter]).containsExactly("K1")
        assertThat(resolved.clientsByRule[company]).containsExactlyInAnyOrder("K2", "K3")
        assertThat(stricter.params).isEqualTo(mapOf("limit" to Param(7.0, ParamUnit.MULTIPLE)))
    }

    @Test
    fun twoSegmentRulesReplacingTheSameKeyForOneClientFail() {
        val first = rule("S1", Layer.SEGMENT, scopeSegmentId = 1, replacesKey = "V1")
        val second = rule("S2", Layer.SEGMENT, scopeSegmentId = 2, replacesKey = "V1")
        assertThatThrownBy { resolver.resolve(listOf(velocity, first, second), listOf(big, huge), clients) }
            .isInstanceOf(ConfigurationException::class.java)
            .hasMessageContaining("K1").hasMessageContaining("S1").hasMessageContaining("S2").hasMessageContaining("V1")
    }

    @Test
    fun replacingAnUnknownRuleFails() {
        val orphan = rule("X-K1", Layer.CLIENT, scopeClientId = "K1", replacesKey = "NOPE")
        assertThatThrownBy { resolver.resolve(listOf(velocity, orphan), emptyList(), clients) }
            .isInstanceOf(ConfigurationException::class.java)
            .hasMessageContaining("NOPE")
    }

    private fun rule(
        key: String,
        layer: Layer,
        scopeSegmentId: Long? = null,
        scopeClientId: String? = null,
        replacesKey: String? = null,
        params: Map<String, Param> = emptyMap(),
    ) = RuleDefinition(key.hashCode().toLong(), key, 1, "A", layer, scopeSegmentId, scopeClientId, Grain.TRANSACTION, null, "true", replacesKey, emptyList(), params)
}
