package cz.morosystems.aml.engine.suggestion

import cz.morosystems.aml.engine.PostgresTest
import cz.morosystems.aml.engine.summary.AlertNotFoundException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
class SuggestionRepositoryTest {
    @Autowired
    lateinit var repository: SuggestionRepository

    @Autowired
    lateinit var jdbc: JdbcClient

    private var alertId = 0L

    @BeforeEach
    fun data() {
        jdbc.sql("truncate run cascade").update()
        jdbc.sql("insert into client (id, country, pep, type, channel, risk) values ('K2', 'CZ', false, 'person', 'branch', 'medium') on conflict (id) do nothing").update()
        val run = jdbc.sql("insert into run (kind, started_at, finished_at) values ('production', now(), now()) returning id").query(Long::class.java).single()
        val rule = jdbc.sql("select id from rule where key = 'C1' order by version desc limit 1").query(Long::class.java).single()
        val hitId = jdbc.sql("insert into rule_hit (run_id, rule_id, client_id, grain_key, evidence) values (?, ?, 'K2', 'T2', ?::jsonb) returning id")
            .params(run, rule, """{"inflow": 11000000, "outflow": 9000000, "p.min_inflow": 10000000}""").query(Long::class.java).single()
        alertId = jdbc.sql("insert into alert (run_id, alert_type, client_id, transaction_id) values (?, 'C', 'K2', 'T2') returning id")
            .params(run).query(Long::class.java).single()
        jdbc.sql("insert into alert_hit (alert_id, hit_id) values (?, ?)").params(alertId, hitId).update()
    }

    @Test
    fun loadsTheAlertsContext() {
        val context = repository.context(alertId, "fine")

        val maxVersion = jdbc.sql("select max(version) from rule where key = 'C1'").query(Int::class.java).single()
        assertThat(context.reason).isEqualTo("fine")
        assertThat(context.hitKeys).containsExactly("C1")
        assertThat(context.rules.map { it.key }).contains("C1")
        assertThat(context.clients.map { it["id"] }).contains("K2")
        assertThat(context.latest["C1"]?.version).isEqualTo(maxVersion)
        assertThat(context.activity.map { it.ref }).contains("rule:C1")
        assertThat(context.existingRules.map { it.rule.key }).contains("C1")
        assertThat(context.existingRules.map { it.status }).doesNotContain("retired")
        assertThat(context.values.keys).containsExactly("tx.direction", "tx.type", "client.type", "client.channel", "client.risk")
    }

    @Test
    fun unknownAlertThrows() {
        assertThatThrownBy { repository.context(-1, "x") }.isInstanceOf(AlertNotFoundException::class.java)
    }
}
