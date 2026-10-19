package cz.morosystems.aml.engine.sql

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.rules.Agg
import cz.morosystems.aml.engine.rules.Grain
import cz.morosystems.aml.engine.rules.RuleDefinition
import cz.morosystems.aml.engine.rules.RuleRepository
import cz.morosystems.aml.engine.rules.VariableDefinition
import cz.morosystems.aml.engine.rules.Window
import java.time.Duration
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
class GrainQueryBuilderTest {
    @Autowired
    lateinit var builder: GrainQueryBuilder

    @Autowired
    lateinit var rules: RuleRepository

    @Autowired
    lateinit var jdbc: JdbcClient

    private val c1 by lazy { rules.activeRules().single { it.key == "C1" } }
    private val a1 by lazy { rules.activeRules().single { it.key == "A1" } }

    @BeforeEach
    fun clients() {
        jdbc.sql("truncate client cascade").update()
        listOf("K1", "K2").forEach {
            jdbc.sql("insert into client (id, country, pep, type, q2_days) values (?, 'CZ', false, 'legal entity', 91)").param(it).update()
        }
    }

    @Test
    fun sumsDayVolumeInBothDirectionsSplitAtMidnight() {
        tx("T1", "K1", "2026-07-14 23:30", 10_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-15 00:30", 5_000, "out", payee = "ACZ2")
        tx("T3", "K1", "2026-07-15 08:00", 1_000, "in", payer = "ACZ1")

        val rows = run(a1).associate { it["grain_key"] to it["day_volume"] }
        assertThat(rows).isEqualTo(mapOf("2026-07-14" to czk(10_000), "2026-07-15" to czk(6_000)))
    }

    @Test
    fun filtersByTxMonth() {
        tx("T1", "K1", "2026-07-10 09:00", 100, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-06-30 12:00", 50, "in", payer = "ACZ1")
        val june = VariableDefinition(1, "june", Agg.SUM, "amount", "tx.month == 6", Window.Relative(Duration.parse("-PT240H"), Duration.ZERO))

        val rows = run(a1.copy(grain = Grain.TRANSACTION, variables = listOf(june))).associate { it["grain_key"] to it["june"] }
        assertThat(rows["T1"]).isEqualTo(czk(50))
    }

    @Test
    fun aSumIsRoundedToTheHellerSoDoublesDoNotDrift() {
        // 19692.76 + 8059.87 is 27752.629999999997 in IEEE doubles; money is exact to the heller.
        tx("T1", "K1", "2026-07-10 09:00", 19_692.76, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-10 11:00", 8_059.87, "in", payer = "ACZ2")

        assertThat(run(a1).single()["day_volume"]).isEqualTo(27_752.63)
    }

    @Test
    fun clientDayRowsCarryTheMonth() {
        tx("T1", "K1", "2026-07-10 09:00", 100, "in", payer = "ACZ1")

        assertThat(run(a1).single { it["grain_key"] == "2026-07-10" }["day_month"]).isEqualTo(7)
    }

    @Test
    fun c1FindsFlowThroughAcrossMidnight() {
        tx("T1", "K1", "2026-07-14 22:00", 60_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-14 23:30", 50_000, "in", payer = "ACZ2")
        tx("T3", "K1", "2026-07-15 01:00", 90_000, "out", payee = "ACZ9")

        val anchor = run(c1).single { it["grain_key"] == "T2" }
        assertThat(anchor["inflow"]).isEqualTo(czk(110_000))
        assertThat(anchor["outflow"]).isEqualTo(czk(90_000))
    }

    @Test
    fun c1IgnoresMoneySentBackToAPayer() {
        tx("T1", "K1", "2026-07-14 22:00", 60_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-14 23:30", 50_000, "in", payer = "ACZ2")
        tx("T3", "K1", "2026-07-15 01:00", 90_000, "out", payee = "ACZ1")

        assertThat(run(c1).single { it["grain_key"] == "T2" }["outflow"]).isEqualTo(0.0)
    }

    @Test
    fun c1CountsOutflowAtExactlySixHoursButNotOneMinuteLater() {
        tx("T1", "K1", "2026-07-14 10:00", 110_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-14 16:00", 90_000, "out", payee = "ACZ9")
        tx("T3", "K2", "2026-07-14 10:00", 110_000, "in", payer = "ACZ1")
        tx("T4", "K2", "2026-07-14 16:01", 90_000, "out", payee = "ACZ9")

        val outflow = run(c1).associate { it["grain_key"] to it["outflow"] }
        assertThat(outflow).isEqualTo(mapOf("T1" to czk(90_000), "T3" to 0.0))
    }

    @Test
    fun c1CountsARemittanceAsOutflow() {
        tx("T1", "K1", "2026-07-14 10:00", 110_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-14 11:00", 5_000, "unknown", payee = "ACZ5")
        tx("T3", "K1", "2026-07-14 12:00", 90_000, "out", payee = "ACZ9")

        val anchor = run(c1).single { it["grain_key"] == "T1" }
        assertThat(anchor["outflow"]).isEqualTo(czk(95_000))
    }

    @Test
    fun c1PayersNeverHoldNull() {
        tx("T1", "K1", "2026-07-14 09:00", 1_000, "in", payer = null)
        tx("T2", "K1", "2026-07-14 10:00", 110_000, "in", payer = "ACZ1")
        tx("T3", "K1", "2026-07-14 12:00", 90_000, "out", payee = "ACZ9")

        val anchor = run(c1).single { it["grain_key"] == "T2" }
        assertThat(anchor["payers"]).isNotNull()
        assertThat(anchor["outflow"]).isEqualTo(czk(90_000))
    }

    @Test
    fun filtersTreatAMissingAccountAsEmptyLikeConditionsDo() {
        tx("T1", "K1", "2026-07-14 10:00", 1_000, "in", payer = "ACZ1")
        tx("T2", "K1", "2026-07-14 11:00", 2_000, "unknown", payee = "ACZ5")
        val notFromAcz1 = a1.copy(variables = listOf(VariableDefinition(1, "other_volume", Agg.SUM, "amount", """tx.payer_account != "ACZ1"""", Window.Day)))

        assertThat(run(notFromAcz1).single()["other_volume"]).isEqualTo(czk(2_000))
    }

    @Test
    fun restrictsTransactionGrainToGivenClients() {
        tx("T1", "K1", "2026-07-14 10:00", 1_000, "in", payer = "ACZ1")
        tx("T2", "K2", "2026-07-14 10:00", 1_000, "in", payer = "ACZ1")
        tx("T3", "K1", "2026-06-30 23:59", 1_000, "in", payer = "ACZ1")
        val a3 = rules.activeRules().single { it.key == "A3" }

        assertThat(run(a3, setOf("K1")).map { it["grain_key"] }).containsExactly("T1")
    }

    @Test
    fun rejectsAVariableNamedLikeATransactionColumn() {
        val clash = a1.copy(variables = listOf(VariableDefinition(1, "amount", Agg.SUM, "amount", "true", Window.Day)))
        assertThatThrownBy { builder.build(clash, Period.JULY_2026, null) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun rejectsAnUnknownField() {
        val unknown = a1.copy(variables = listOf(VariableDefinition(1, "day_volume", Agg.SUM, "amount; drop table client", "true", Window.Day)))
        assertThatThrownBy { builder.build(unknown, Period.JULY_2026, null) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    /** The test writes whole CZK; a stored amount and every aggregate over it are CZK doubles. */
    private fun czk(amount: Long) = amount.toDouble()

    private fun run(rule: RuleDefinition, clientIds: Set<String>? = null): List<Map<String, Any?>> {
        val query = builder.build(rule, Period.JULY_2026, clientIds)
        return jdbc.sql(query.sql).params(query.params).query().listOfRows()
    }

    /** [amountCzk] is CZK, whole or to the heller. */
    private fun tx(id: String, client: String, ts: String, amountCzk: Number, direction: String, payer: String? = null, payee: String? = null) {
        val amount = amountCzk.toDouble()
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_account, payee_account, type, direction)
            values (?, ?, ?::timestamp, ?, ?, 'CZK', 1, ?, ?, 'x', ?)
            """,
        ).params(listOf(id, client, ts, amount, amount, payer, payee, direction)).update()
    }
}
