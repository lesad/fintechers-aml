package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.PostgresTest
import java.time.Duration
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

@PostgresTest
class RuleRepositoryTest {
    @Autowired
    lateinit var repository: RuleRepository

    @Test
    fun loadsTheSixSeededRules() {
        assertThat(repository.activeRules().map { it.key }).containsExactlyInAnyOrder("A1", "A2", "A3", "B1", "B2", "C1")
    }

    @Test
    fun loadsC1VariablesWithRelativeWindowsInOrder() {
        val c1 = repository.activeRules().single { it.key == "C1" }
        assertThat(c1.grain).isEqualTo(Grain.CLIENT_ANCHOR)
        assertThat(c1.variables.map { it.name }).containsExactly("inflow", "payers", "outflow")
        assertThat(c1.variables.map { it.window }).containsExactly(
            Window.Relative(Duration.ofHours(-24), Duration.ZERO),
            Window.Relative(Duration.ofHours(-24), Duration.ZERO),
            Window.Relative(Duration.ZERO, Duration.ofHours(6)),
        )
        assertThat(c1.variables[1].agg).isEqualTo(Agg.SET)
    }

    @Test
    fun loadsDayWindowForA1() {
        val a1 = repository.activeRules().single { it.key == "A1" }
        assertThat(a1.variables.single().window).isEqualTo(Window.Day)
    }

    @Test
    fun loadsCompanyParams() {
        val c1 = repository.params().filter { it.ruleKey == "C1" }.associate { it.name to it.value }
        assertThat(c1).isEqualTo(mapOf("min_inflow" to 10_000_000L, "forward_pct" to 80L))
        assertThat(repository.params().all { it.layer == Layer.COMPANY }).isTrue()
    }
}
