package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.rules.Grain
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AlertGrouperTest {
    private val units = mapOf("A" to "client", "B" to "transaction", "C" to "client")

    @Test
    fun groupsAClientsFlowThroughWindowsIntoOneAlert() {
        val hits = (1..3).map { hit(it, "C1", "C", "K1", "T$it", Grain.CLIENT_ANCHOR) }
        val alerts = AlertGrouper.group(hits, units)
        assertThat(alerts).hasSize(1)
        assertThat(alerts.single().hits).hasSize(3)
        assertThat(alerts.single().transactionId).isNull()
    }

    @Test
    fun groupsBothBBranchesOnOneTransactionIntoOneAlert() {
        val hits = listOf(hit(1, "B1", "B", "K1", "T9", Grain.TRANSACTION), hit(2, "B2", "B", "K1", "T9", Grain.TRANSACTION))
        val alert = AlertGrouper.group(hits, units).single()
        assertThat(alert.transactionId).isEqualTo("T9")
        assertThat(alert.hits.map { it.ruleKey }).containsExactly("B1", "B2")
    }

    @Test
    fun keepsSeparateBAlertsPerTransaction() {
        val hits = listOf(hit(1, "B2", "B", "K1", "T1", Grain.TRANSACTION), hit(2, "B2", "B", "K1", "T2", Grain.TRANSACTION))
        assertThat(AlertGrouper.group(hits, units).map { it.transactionId }).containsExactlyInAnyOrder("T1", "T2")
    }

    @Test
    fun groupsDayAndTransactionHitsOfRuleAIntoOneAlertPerClient() {
        val hits = listOf(
            hit(1, "A1", "A", "K2", "2026-07-03", Grain.CLIENT_DAY),
            hit(2, "A1", "A", "K2", "2026-07-09", Grain.CLIENT_DAY),
            hit(3, "A3", "A", "K2", "T5", Grain.TRANSACTION),
            hit(4, "A1", "A", "K3", "2026-07-09", Grain.CLIENT_DAY),
        )
        assertThat(AlertGrouper.group(hits, units).map { it.clientId to it.hits.size }).containsExactlyInAnyOrder("K2" to 3, "K3" to 1)
    }

    private fun hit(id: Int, rule: String, type: String, client: String, key: String, grain: Grain) =
        Hit(id.toLong(), 0, rule, type, client, key, grain, emptyMap())
}
