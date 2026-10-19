package cz.morosystems.aml.engine.sql

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.rules.Agg
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
class FilterCompilerTest {
    @Autowired
    lateinit var compiler: FilterCompiler

    @Autowired
    lateinit var jdbc: JdbcClient

    private val payers = mapOf("payers" to Agg.SET)

    @BeforeEach
    fun rows() {
        jdbc.sql("truncate client cascade").update()
        jdbc.sql("insert into client (id, country, pep, type, q2_days) values ('K1', 'CZ', false, 'legal entity', 91)").update()
        listOf(
            arrayOf("T1", "in", "ACZ1", "K1"),
            arrayOf("T2", "in", "ACZ2", "K1"),
            arrayOf("T3", "out", "K1", "ACZ1"),
            arrayOf("T4", "out", "K1", "ACZ9"),
            arrayOf("T5", "unknown", null, "ACZ5"),
        ).forEach { (id, direction, payer, payee) ->
            jdbc.sql(
                """
                insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_account, payee_account, type, direction)
                values (?, 'K1', timestamp '2026-07-14 10:00', 100, 1, 'CZK', 1, ?, ?, 'x', ?)
                """,
            ).params(listOf(id, payer, payee, direction)).update()
        }
    }

    @Test
    fun trueSelectsEveryRow() {
        assertThat(select("true", "array['ACZ1','ACZ2']")).containsExactlyInAnyOrder("T1", "T2", "T3", "T4", "T5")
    }

    @Test
    fun selectsIncomingByDirection() {
        assertThat(select("""tx.direction == "in"""", "array['ACZ1','ACZ2']")).containsExactlyInAnyOrder("T1", "T2")
    }

    @Test
    fun excludesOutflowBackToAPayer() {
        val filter = """tx.direction == "out" && !(tx.payee_account in payers)"""
        assertThat(select(filter, "array['ACZ1','ACZ2']")).containsExactly("T4")
    }

    @Test
    fun keepsEveryOutflowWhenThereAreNoPayers() {
        val filter = """tx.direction == "out" && !(tx.payee_account in payers)"""
        assertThat(select(filter, "array[]::text[]")).containsExactlyInAnyOrder("T3", "T4")
    }

    @Test
    fun bindsStringLiteralsAsParameters() {
        val fragment = compiler.compile("""tx.direction == "in"""", payers)
        assertThat(fragment.sql).doesNotContain("'in'").doesNotContain("\"in\"")
        assertThat(fragment.params).contains("in")
    }

    private fun select(filter: String, payersArray: String): List<String?> {
        val fragment = compiler.compile(filter, payers)
        return jdbc.sql("select tx.id from transaction tx cross join (select $payersArray::text[] as payers) v where ${fragment.sql}")
            .params(fragment.params)
            .query(String::class.java)
            .list()
    }
}
