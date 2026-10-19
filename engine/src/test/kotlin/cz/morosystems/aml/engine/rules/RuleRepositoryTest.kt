package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.PostgresTest
import java.time.Duration
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
class RuleRepositoryTest {
    @Autowired
    lateinit var repository: RuleRepository

    @Autowired
    lateinit var jdbc: JdbcClient

    @BeforeEach
    fun seededOnly() = jdbc.resetRules()

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
    fun loadsParamsPerVersion() {
        val c1 = repository.activeRules().single { it.key == "C1" }
        assertThat(c1.params).isEqualTo(mapOf("min_inflow" to Param(10_000_000, ParamUnit.AMOUNT), "forward_pct" to Param(80, ParamUnit.PERCENT)))
    }

    @Test
    fun listsEverySeededVersionNewestFirstPerKey() {
        val versions = repository.allVersions()
        assertThat(versions.map { "${it.rule.key} v${it.rule.version}" })
            .containsExactly("A1 v1", "A2 v1", "A3 v1", "B1 v1", "B2 v1", "C1 v2", "C1 v1")
        assertThat(versions.last().status).isEqualTo("retired")
        assertThat(versions.last().rule.params).containsEntry("forward_pct", Param(80, ParamUnit.PERCENT))
        assertThat(versions.map { it.explanation }).containsOnlyNulls()
    }

    @Test
    fun insertsADraftAsTheNextVersion() {
        val id = repository.insertDraft(newB2(pepMin = 5_000_000))
        val saved = repository.find(id)!!
        assertThat(saved.rule.version).isEqualTo(2)
        assertThat(saved.status).isEqualTo("draft")
        assertThat(saved.rule.params).isEqualTo(mapOf("pep_min" to Param(5_000_000, ParamUnit.AMOUNT)))
        assertThat(saved.author).isEqualTo("J. Novák")
        assertThat(repository.find(repository.insertDraft(newB2()))!!.rule.version).isEqualTo(3)
        assertThat(repository.latestOf("B2")!!.version).isEqualTo(3)
    }

    @Test
    fun aNewVersionKeepsTheRuleName() {
        val id = repository.insertDraft(newB2())
        val name = jdbc.sql("select name from rule where id = ?").param(id).query(String::class.java).single()
        assertThat(name).isEqualTo("PEP outgoing payment above the limit")
    }

    @Test
    fun roundTripsVariablesAndWindows() {
        val rule = newC1(key = "C9")
        val saved = repository.find(repository.insertDraft(rule))!!
        assertThat(saved.rule.version).isEqualTo(1)
        assertThat(saved.rule.anchor).isEqualTo(rule.anchor)
        assertThat(saved.rule.variables).isEqualTo(rule.variables)
    }

    @Test
    fun savesAnExplanationOnlyOnce() {
        val id = repository.insertDraft(newB2())
        assertThat(repository.missingExplanations().map { it.id }).contains(id)
        repository.saveExplanation(id, Explanation("Flags first.", "model-a", "hash-a"))
        repository.saveExplanation(id, Explanation("Flags second.", "model-b", "hash-b"))
        val saved = repository.find(id)!!
        assertThat(saved.explanation).isEqualTo("Flags first.")
        assertThat(saved.explanationModel).isEqualTo("model-a")
        assertThat(repository.missingExplanations().map { it.id }).doesNotContain(id)
    }

    @Test
    fun unknownIdIsNull() {
        assertThat(repository.find(Long.MAX_VALUE)).isNull()
    }
}
