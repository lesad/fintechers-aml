package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.summary.Activity
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
class AlertFactsTest {
    @Autowired
    lateinit var jdbc: JdbcClient

    @Autowired
    lateinit var facts: AlertFacts

    private var runId = 0L

    @BeforeEach
    fun data() {
        cleanUp()
        runId = jdbc.sql("insert into run (kind, started_at, finished_at, period_from, period_to) values ('production', now(), now(), '2026-07-01', '2026-10-01') returning id")
            .query(Long::class.java).single()
        client("AF1", q2Volume = 900000.0, q2Days = 90)
    }

    @AfterEach
    fun cleanUp() {
        jdbc.sql("truncate run cascade").update()
        jdbc.sql("delete from transaction where client_id like 'AF%'").update()
        jdbc.sql("delete from client where id like 'AF%'").update()
        jdbc.sql("delete from reference_list where list = 'high_risk' and code = 'ZZ'").update()
    }

    private fun client(id: String, q2Volume: Double? = null, q2Days: Int? = null) {
        jdbc.sql(
            """
            insert into client (id, country, contract_date, channel, pep, type, expected_monthly_volume, expected_count,
                                q2_volume, q2_tx_count, q2_max_tx, q2_days, risk)
            values (?, 'CZ', '2025-01-15', 'branch', false, 'company', 300000, 20, ?, 60, 50000, ?, 'medium')
            """.trimIndent(),
        ).params(listOf<Any?>(id, q2Volume, q2Days)).update()
    }

    private fun tx(
        id: String, client: String = "AF1", ts: String = "2026-09-20 10:00:00", amount: Double, direction: String = "out",
        payee: String? = null, payer: String? = null, payeeCountry: String? = null, currency: String = "CZK",
    ) {
        jdbc.sql(
            """
            insert into transaction (id, client_id, ts, amount, volume, currency, fx_rate, payer_country, payee_country,
                                     payer_account, payee_account, type, direction)
            values (?, ?, ?::timestamp, ?, ?, ?, 1, null, ?, ?, ?, 'transfer', ?)
            """.trimIndent(),
        ).params(listOf<Any?>(id, client, ts, amount, amount, currency, payeeCountry, payer, payee, direction)).update()
    }

    /** An alert of [type] on [client] flagging [transactionId] (also its hit's grain key), with [evidence] on the hit of rule [rule]. */
    private fun alert(transactionId: String?, type: String = "C", client: String = "AF1", rule: String = "C1", grainKey: String? = transactionId, evidence: String = "{}"): Long {
        val ruleId = jdbc.sql("select id from rule where key = ? order by version desc limit 1").param(rule).query(Long::class.java).single()
        val hit = jdbc.sql("insert into rule_hit (run_id, rule_id, client_id, grain_key, evidence) values (?, ?, ?, ?, ?::jsonb) returning id")
            .params(listOf<Any?>(runId, ruleId, client, grainKey, evidence)).query(Long::class.java).single()
        val alert = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, ?, ?, ?) returning id")
            .params(listOf<Any?>(runId, type, client, transactionId)).query(Long::class.java).single()
        jdbc.sql("insert into alert_hit (alert_id, hit_id) values (?, ?)").params(alert, hit).update()
        return alert
    }

    private fun Activity.field(key: String) = data[key]

    private fun item(items: List<Activity>, ref: String) = items.single { it.ref == ref }

    @Test
    fun profileComparesTheFlaggedDayWithTheQ2Baseline() {
        tx("AF-T1", amount = 30000.0, ts = "2026-09-20 09:00:00")
        tx("AF-T2", amount = 12000.0, ts = "2026-09-20 11:00:00")
        val alertId = alert(null, "B", grainKey = "2026-09-20")

        val profile = item(facts.collect(alertId), "client:profile")

        assertThat(profile.kind).isEqualTo("client_profile")
        assertThat(profile.field("flaggedDayVolume").toString()).isEqualTo("42000")
        assertThat(profile.field("dayVsQ2AvgDay")).isEqualTo("4.2")
        assertThat(profile.field("largestAmount").toString()).isEqualTo("30000")
        assertThat(profile.field("largestVsQ2MaxTx")).isEqualTo("0.6")
        assertThat(profile.field("tenureMonths")).isEqualTo(20L)
        assertThat(profile.field("type")).isEqualTo("company")
        assertThat(profile.field("q2Days")).isEqualTo(90)
        assertThat(profile.data).doesNotContainKey("baseline")
    }

    @Test
    fun aClientWithoutBaselineGetsNoRatios() {
        client("AF2", q2Volume = 0.0, q2Days = 0)
        tx("AF-T1", client = "AF2", amount = 30000.0)
        val alertId = alert("AF-T1", client = "AF2")

        val profile = item(facts.collect(alertId), "client:profile")

        assertThat(profile.field("baseline")).isEqualTo("missing")
        assertThat(profile.data).doesNotContainKeys("dayVsQ2AvgDay", "largestVsQ2MaxTx")
    }

    @Test
    fun counterpartiesCarryHistoryAndSharedUse() {
        jdbc.sql("insert into reference_list (list, code) values ('high_risk', 'ZZ') on conflict do nothing").update()
        client("AF2")
        tx("AF-E1", amount = 178200.0, ts = "2026-08-01 10:00:00", payee = "AAT00116")
        tx("AF-E2", amount = 186900.0, ts = "2026-08-15 10:00:00", payee = "AAT00116")
        tx("AF-O1", client = "AF2", amount = 5000.0, ts = "2026-07-01 10:00:00", payee = "AAT00116")
        tx("AF-T1", amount = 190000.0, payee = "AAT00116", payeeCountry = "ZZ")
        val alertId = alert("AF-T1")

        val counterparty = item(facts.collect(alertId), "counterparty:AAT00116")

        assertThat(counterparty.field("country")).isEqualTo("ZZ")
        assertThat(counterparty.field("highRiskCountry")).isEqualTo(true)
        assertThat(counterparty.field("firstSeen")).isEqualTo("2026-07-01")
        val earlier = counterparty.field("earlierWithClient") as Map<*, *>
        assertThat(earlier["count"]).isEqualTo(2)
        assertThat(earlier["min"].toString()).isEqualTo("178200")
        assertThat(earlier["max"].toString()).isEqualTo("186900")
        assertThat(counterparty.field("otherClients")).isEqualTo(1)
    }

    @Test
    fun aTransactionWithoutCounterpartyAddsNoCounterpartyItem() {
        tx("AF-T1", amount = 30000.0, payee = null)
        val alertId = alert("AF-T1")

        val items = facts.collect(alertId)

        assertThat(items.map { it.ref }).noneMatch { it.startsWith("counterparty:") }
        assertThat(item(items, "flow:activity").field("omittedCounterparties")).isEqualTo(0)
    }

    @Test
    fun flowMeasuresTheForwardAfterTheInflow() {
        tx("AF-T1", amount = 110000.0, direction = "in", ts = "2026-09-20 10:00:00", payer = "AAT00200")
        tx("AF-T2", amount = 90000.0, direction = "out", ts = "2026-09-20 10:15:00", payee = "AAT00300")
        val alertId = alert(null, grainKey = "2026-09-20")

        val flow = item(facts.collect(alertId), "flow:activity")

        assertThat(flow.field("flaggedCount")).isEqualTo(2)
        assertThat(flow.field("inCount")).isEqualTo(1)
        assertThat(flow.field("outCount")).isEqualTo(1)
        assertThat(flow.field("minutesInToNextOut")).isEqualTo(15L)
        assertThat(flow.field("forwardedPercent")).isEqualTo("82")
    }

    @Test
    fun amountsJustUnderAThresholdAreListed() {
        tx("AF-T1", amount = 95000.0, currency = "EUR")
        val alertId = alert("AF-T1", evidence = """{"p.min_inflow": 100000}""")

        val flow = item(facts.collect(alertId), "flow:activity")

        val listed = flow.field("justUnderThreshold") as List<*>
        assertThat(listed).hasSize(1)
        val entry = listed.single() as Map<*, *>
        assertThat(entry["amount"].toString()).isEqualTo("95000")
        assertThat(entry["parameter"]).isEqualTo("p.min_inflow")
        assertThat(entry["threshold"].toString()).isEqualTo("100000")
        assertThat(flow.field("foreignCurrency")).isEqualTo(1)
        assertThat(flow.field("roundAmounts")).isEqualTo(1)
    }

    @Test
    fun otherAlertsAreListedAndEmptyWhenNone() {
        tx("AF-T1", amount = 30000.0)
        tx("AF-T2", amount = 20000.0)
        val alone = alert("AF-T1")
        assertThat(item(facts.collect(alone), "client:alerts").field("alerts")).isEqualTo(emptyList<Any>())

        val other = alert("AF-T2", type = "A", rule = "A1")
        jdbc.sql("insert into alert_triage (alert_id, disposition, score, reasons, config_version, input_hash) values (?, 'ESCALATE', 50, '[]'::jsonb, 'test', 'h')").param(other).update()

        val listed = item(facts.collect(alone), "client:alerts").field("alerts") as List<*>
        assertThat(listed).containsExactly(mapOf("alertType" to "A", "disposition" to "ESCALATE", "status" to "NEW"))
    }

    @Test
    fun theAlertTypeOrdersTheItems() {
        tx("AF-T1", amount = 30000.0, payee = "AAT00116")
        val typeC = alert("AF-T1", type = "C")
        val typeA = alert("AF-T1", type = "A", rule = "A1")
        val typeB = alert("AF-T1", type = "B", rule = "B1")

        assertThat(facts.collect(typeC).map { it.ref }).containsExactly("flow:activity", "counterparty:AAT00116", "client:profile", "client:alerts")
        assertThat(facts.collect(typeA).map { it.ref }).containsExactly("client:profile", "client:alerts", "flow:activity", "counterparty:AAT00116")
        assertThat(facts.collect(typeB).map { it.ref }).containsExactly("client:profile", "counterparty:AAT00116", "flow:activity", "client:alerts")
    }
}
