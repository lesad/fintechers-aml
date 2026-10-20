package cz.morosystems.aml.engine.triage

import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.transaction.annotation.Transactional

/**
 * The stored config is insert-only and exactly one version is live. Every test that writes is `@Transactional` so the
 * seeded version 1 is still the active one for the next test sharing this container.
 */
@PostgresTest
class TriageConfigRepositoryTest {
    @Autowired
    lateinit var repository: TriageConfigRepository

    @Autowired
    lateinit var jdbc: JdbcClient

    @Test
    fun loadsTheSeededVersionAsTheActiveOne() {
        val active = repository.active()

        assertThat(active.version).isEqualTo(1)
        assertThat(active.status).isEqualTo("active")
        assertThat(active.author).isEqualTo("finreg-brief")
        assertThat(active.config.configVersion).isEqualTo("triage-v1")
    }

    @Test
    fun loadsTheSixSeededRuleScores() {
        assertThat(repository.active().config.ruleTriage).isEqualTo(TriageConfigTest.SEEDED_RULES)
    }

    @Test
    fun theSeededPayloadCarriesTheRuleAgnosticPolicy() {
        val config = repository.active().config

        assertThat(config.unknownRuleScore).isEqualTo(70)
        assertThat(config.bands.map { it.maxScore }).containsExactly(24, 44, 64, 84, 100)
        assertThat(config.highRiskCountries).isEmpty()
    }

    @Test
    fun theSeededRowsLoadBackAsExactlyTheConfigTheyDescribe() {
        // The regression gate for the normalization: the policy was one jsonb document, and splitting it into real
        // columns and child tables must not have moved a single value. Field by field, then as a whole.
        val config = repository.active().config
        val expected = TriageConfigTest.SEEDED_CONFIG

        assertThat(config.configVersion).isEqualTo(expected.configVersion)
        assertThat(config.ruleTriage).isEqualTo(expected.ruleTriage)
        assertThat(config.unknownRuleScore).isEqualTo(expected.unknownRuleScore)
        assertThat(config.perExtraRule).isEqualTo(expected.perExtraRule)
        assertThat(config.extraRuleMax).isEqualTo(expected.extraRuleMax)
        assertThat(config.factors).isEqualTo(expected.factors)
        assertThat(config.amountBands).containsExactlyElementsOf(expected.amountBands)
        assertThat(config.intensityBands).isEqualTo(expected.intensityBands)
        assertThat(config.bands).containsExactlyElementsOf(expected.bands)
        assertThat(config.requiredFields).containsExactlyElementsOf(expected.requiredFields)
        assertThat(config.floors).containsExactlyElementsOf(expected.floors)
        assertThat(config.highRiskCountries).isEmpty()
        assertThat(config.alertTypeNames).isEmpty()
        assertThat(config.ruleNames).isEmpty()
        assertThat(config).isEqualTo(expected)
    }

    @Test
    @Transactional
    fun orderedChildrenComeBackInTheOrderTheyWereAuthoredIn() {
        // Authored order is the decision: which amount band wins, in which order floors and missing-data reasons are
        // listed. A draft written with the order reversed must read back reversed, not re-sorted by value.
        val reversed = TriageConfigTest.SEEDED_CONFIG.copy(
            requiredFields = TriageConfigTest.SEEDED_CONFIG.requiredFields.reversed(),
            floors = TriageConfigTest.SEEDED_CONFIG.floors.reversed(),
        )
        val id = repository.insertDraft(NewTriageConfig(config = reversed, author = "J. Novák"))

        val stored = repository.allVersions().single { it.id == id }.config
        assertThat(stored.requiredFields).containsExactlyElementsOf(reversed.requiredFields)
        assertThat(stored.floors).containsExactlyElementsOf(reversed.floors)
        assertThat(stored.amountBands).containsExactlyElementsOf(TriageConfigTest.SEEDED_CONFIG.amountBands)
        assertThat(stored.bands).containsExactlyElementsOf(TriageConfigTest.SEEDED_CONFIG.bands)
    }

    @Test
    @Transactional
    fun copyAsDraftCopiesEveryChildTable() {
        val id = repository.copyAsDraft(1, "J. Novák")

        val copy = repository.allVersions().single { it.id == id }
        assertThat(copy.version).isEqualTo(2)
        assertThat(copy.status).isEqualTo("draft")
        assertThat(copy.author).isEqualTo("J. Novák")
        // Every child table travels: the copy differs from the seed only in the version it is stamped with.
        assertThat(copy.config).isEqualTo(TriageConfigTest.SEEDED_CONFIG.copy(configVersion = "triage-v2"))
        assertThat(repository.active().version).isEqualTo(1)
    }

    @Test
    @Transactional
    fun copyAsDraftOfAVersionThatIsNotThereFails() {
        assertThatThrownBy { repository.copyAsDraft(999, "J. Novák") }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    @Transactional
    fun upsertRuleAddsAKeyTheCopyDidNotScoreAndReplacesOneItDid() {
        val id = repository.copyAsDraft(1, "J. Novák")
        repository.upsertRule(id, "A1", RuleTriage(baseScore = 99, autoCloseable = false, impliesPep = true))
        repository.upsertRule(id, "Z9", RuleTriage(baseScore = 50, autoCloseable = false, impliesPep = false))

        val scores = repository.allVersions().single { it.id == id }.config.ruleTriage
        assertThat(scores).containsEntry("A1", RuleTriage(99, autoCloseable = false, impliesPep = true))
        assertThat(scores).containsEntry("Z9", RuleTriage(50, autoCloseable = false, impliesPep = false))
        assertThat(scores).hasSize(7)
    }

    @Test
    @Transactional
    fun updateFactorsWritesOnlyTheNumbersThePatchNames() {
        val id = repository.copyAsDraft(1, "J. Novák")
        repository.updateFactors(id, FactorsPatch(unknownRuleScore = 55, pep = 21))

        val config = repository.allVersions().single { it.id == id }.config
        assertThat(config.unknownRuleScore).isEqualTo(55)
        assertThat(config.factors.pep).isEqualTo(21)
        assertThat(config.factors).isEqualTo(TriageConfigTest.SEEDED_CONFIG.factors.copy(pep = 21))
        assertThat(config.perExtraRule).isEqualTo(3)
    }

    @Test
    @Transactional
    fun theVersionNumberIsAssignedByTheDatabaseNotTheCaller() {
        val first = repository.insertDraft(draft())
        val second = repository.insertDraft(draft())

        assertThat(version(first)).isEqualTo(2)
        assertThat(version(second)).isEqualTo(3)
    }

    @Test
    @Transactional
    fun aDraftKeepsItsOwnRuleScores() {
        repository.insertDraft(draft(mapOf("Z9" to RuleTriage(baseScore = 50, autoCloseable = false, impliesPep = true))))

        val draft = repository.find(2)!!
        assertThat(draft.status).isEqualTo("draft")
        assertThat(draft.config.configVersion).isEqualTo("triage-v2")
        assertThat(draft.config.ruleTriage).isEqualTo(mapOf("Z9" to RuleTriage(baseScore = 50, autoCloseable = false, impliesPep = true)))
    }

    @Test
    @Transactional
    fun activatingAVersionRetiresItsPredecessor() {
        repository.insertDraft(draft())
        repository.activate(2)

        assertThat(repository.active().version).isEqualTo(2)
        assertThat(repository.find(1)!!.status).isEqualTo("retired")
    }

    @Test
    @Transactional
    fun aRetiredVersionStillLoadsWithItsOwnRuleScores() {
        repository.insertDraft(draft(mapOf("A1" to RuleTriage(baseScore = 99, autoCloseable = false, impliesPep = false))))
        repository.activate(2)

        val retired = repository.find(1)!!
        assertThat(retired.status).isEqualTo("retired")
        assertThat(retired.config.ruleTriage).isEqualTo(TriageConfigTest.SEEDED_RULES)
        assertThat(repository.active().config.ruleTriage).containsEntry("A1", RuleTriage(99, autoCloseable = false, impliesPep = false))
    }

    @Test
    @Transactional
    fun onlyOneVersionMayBeActive() {
        repository.insertDraft(draft())

        assertThatThrownBy { jdbc.sql("update triage_config set status = 'active' where version = 2").update() }
            .isInstanceOf(DuplicateKeyException::class.java)
    }

    @Test
    @Transactional
    fun aFloorThatTestsNoAlertTypeMayNotCarryOne() {
        // The SQL twin of `TriageConfig`'s init require, so the invariant holds against anything that writes a row,
        // not just against what went through Kotlin. One failed statement per test: Postgres aborts the transaction.
        val id = repository.copyAsDraft(1, "J. Novák")

        assertThatThrownBy {
            jdbc.sql("insert into triage_floor (config_id, position, condition, alert_type, min_disposition) values (?, 9, 'UNKNOWN_RULE', 'B', 'ESCALATE')")
                .param(id).update()
        }.isInstanceOf(DataIntegrityViolationException::class.java)
    }

    @Test
    @Transactional
    fun anAlertTypeFloorWithoutAnAlertTypeIsRejectedByTheSchema() {
        val id = repository.copyAsDraft(1, "J. Novák")

        assertThatThrownBy {
            jdbc.sql("insert into triage_floor (config_id, position, condition, alert_type, min_disposition) values (?, 9, 'ALERT_TYPE', null, 'ESCALATE')")
                .param(id).update()
        }.isInstanceOf(DataIntegrityViolationException::class.java)
    }

    @Test
    @Transactional
    fun aRequiredFieldOutsideTheClosedSetIsRejectedByTheSchema() {
        val id = repository.copyAsDraft(1, "J. Novák")

        assertThatThrownBy {
            jdbc.sql("insert into triage_required_field (config_id, position, field) values (?, 9, 'client.favourite_colour')").param(id).update()
        }.isInstanceOf(DataIntegrityViolationException::class.java)
    }

    @Test
    @Transactional
    fun listsEveryVersionNewestFirst() {
        repository.insertDraft(draft())
        repository.insertDraft(draft())

        assertThat(repository.allVersions().map { it.version }).containsExactly(3, 2, 1)
    }

    @Test
    fun anUnknownVersionIsNull() {
        assertThat(repository.find(999)).isNull()
    }

    @Test
    @Transactional
    fun activatingAVersionThatIsNotThereFails() {
        assertThatThrownBy { repository.activate(999) }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun theLiveRuleKeysAreTheOnesTriageHasToCover() {
        assertThat(repository.liveRuleKeys()).containsExactlyInAnyOrder("A1", "A2", "A3", "B1", "B2", "C1")
    }

    private fun version(id: Long) = jdbc.sql("select version from triage_config where id = ?").param(id).query(Int::class.java).single()

    private fun draft(rules: Map<String, RuleTriage> = TriageConfigTest.SEEDED_RULES) = NewTriageConfig(
        // The version on the config is a placeholder; the repository assigns the real one.
        config = TriageConfigTest.SEEDED_CONFIG.copy(configVersion = TriageConfigRepository.configVersion(0), ruleTriage = rules),
        author = "J. Novák",
    )
}
