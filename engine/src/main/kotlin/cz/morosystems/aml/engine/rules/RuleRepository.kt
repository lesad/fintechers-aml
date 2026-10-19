package cz.morosystems.aml.engine.rules

import java.sql.ResultSet
import java.time.Duration
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository

@Repository
class RuleRepository(private val jdbc: JdbcClient) {
    fun activeRules(): List<RuleDefinition> {
        val variables = jdbc.sql(
            """
            select v.rule_id, v.position, v.name, v.agg, v.field, v.filter, v.window_kind,
                   extract(epoch from v.window_from)::bigint as from_seconds,
                   extract(epoch from v.window_to)::bigint as to_seconds
            from rule_variable v join rule r on r.id = v.rule_id
            where r.status = 'active'
            order by v.rule_id, v.position
            """,
        ).query { rs, _ -> rs.getLong("rule_id") to variable(rs) }.list().groupBy({ it.first }, { it.second })

        val params = jdbc.sql(
            "select p.rule_id, p.name, p.value from rule_param p join rule r on r.id = p.rule_id where r.status = 'active'",
        ).query { rs, _ -> Triple(rs.getLong("rule_id"), rs.getString("name"), rs.getLong("value")) }.list()
            .groupBy({ it.first }, { it.second to it.third }).mapValues { it.value.toMap() }

        return jdbc.sql(
            """
            select id, key, version, alert_type, layer, scope_segment_id, scope_client_id,
                   grain, anchor, condition, replaces_key
            from rule where status = 'active' order by key
            """,
        ).query { rs, _ ->
            val id = rs.getLong("id")
            RuleDefinition(
                id = id,
                key = rs.getString("key"),
                version = rs.getInt("version"),
                alertType = rs.getString("alert_type"),
                layer = Layer.valueOf(rs.getString("layer").uppercase()),
                scopeSegmentId = rs.getObject("scope_segment_id") as Long?,
                scopeClientId = rs.getString("scope_client_id"),
                grain = Grain.valueOf(rs.getString("grain").uppercase()),
                anchor = rs.getString("anchor"),
                condition = rs.getString("condition"),
                replacesKey = rs.getString("replaces_key"),
                variables = variables[id].orEmpty(),
                params = params[id].orEmpty(),
            )
        }.list()
    }

    fun segments(): List<Segment> =
        jdbc.sql("select id, name, predicate from segment order by id")
            .query { rs, _ -> Segment(rs.getLong("id"), rs.getString("name"), rs.getString("predicate")) }
            .list()

    private fun variable(rs: ResultSet) = VariableDefinition(
        position = rs.getInt("position"),
        name = rs.getString("name"),
        agg = Agg.valueOf(rs.getString("agg").uppercase()),
        field = rs.getString("field"),
        filter = rs.getString("filter"),
        window = when (rs.getString("window_kind")) {
            "day" -> Window.Day
            else -> Window.Relative(Duration.ofSeconds(rs.getLong("from_seconds")), Duration.ofSeconds(rs.getLong("to_seconds")))
        },
    )
}
