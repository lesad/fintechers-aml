package cz.morosystems.aml.engine.rules

import java.sql.ResultSet
import java.time.Duration
import java.time.OffsetDateTime
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

@Repository
class RuleRepository(private val jdbc: JdbcClient) {
    fun activeRules(): List<RuleDefinition> = load("r.status = 'active'").map { it.rule }

    /** Every version of every rule, by key, newest version first. */
    fun allVersions(): List<RuleVersion> = load("true")

    fun find(id: Long): RuleVersion? = load("r.id = ?", id).singleOrNull()

    /** The highest version of [key], whatever its status. */
    fun latestOf(key: String): RuleDefinition? =
        load("r.key = ? and r.version = (select max(version) from rule where key = ?)", key, key).singleOrNull()?.rule

    fun missingExplanations(): List<RuleDefinition> = load("r.explanation is null").map { it.rule }

    fun alertTypeExists(code: String): Boolean =
        jdbc.sql("select exists (select 1 from alert_type where code = ?)").param(code).query(Boolean::class.java).single()

    fun segmentName(id: Long): String? =
        jdbc.sql("select name from segment where id = ?").param(id).query(String::class.java).optional().orElse(null)

    fun segments(): List<Segment> =
        jdbc.sql("select id, name, predicate from segment order by id")
            .query { rs, _ -> Segment(rs.getLong("id"), rs.getString("name"), rs.getString("predicate")) }
            .list()

    /** Stores [rule] as a `draft` with the next version number of its key; returns the new id. */
    @Transactional
    fun insertDraft(rule: NewRule): Long {
        val id = jdbc.sql(
            """
            insert into rule (key, version, alert_type, layer, scope_segment_id, scope_client_id, grain, anchor, condition,
                              replaces_key, status, author, name)
            select ?, coalesce(max(version), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?,
                   (select name from rule where key = ? order by version desc limit 1)
            from rule where key = ?
            returning id
            """,
        ).params(
            listOf(
                rule.key, rule.alertType, rule.layer.name.lowercase(), rule.scopeSegmentId, rule.scopeClientId,
                rule.grain.name.lowercase(), rule.anchor, rule.condition, rule.replacesKey, rule.author, rule.key, rule.key,
            ),
        ).query(Long::class.java).single()

        rule.variables.forEach { v ->
            val (kind, from, to) = when (val w = v.window) {
                Window.Day -> Triple("day", null, null)
                is Window.Relative -> Triple("relative", w.from.seconds, w.to.seconds)
            }
            jdbc.sql(
                """
                insert into rule_variable (rule_id, position, name, agg, field, filter, window_kind, window_from, window_to)
                values (?, ?, ?, ?, ?, ?, ?, make_interval(secs => ?::bigint), make_interval(secs => ?::bigint))
                """,
            ).params(listOf(id, v.position, v.name, v.agg.name.lowercase(), v.field, v.filter, kind, from, to)).update()
        }
        rule.params.forEach { (name, param) ->
            jdbc.sql("insert into rule_param (rule_id, name, value, unit) values (?, ?, ?, ?)")
                .params(id, name, param.value, param.unit.name.lowercase()).update()
        }
        return id
    }

    /** Writes the explanation once; a version that already has one keeps it. */
    fun saveExplanation(id: Long, explanation: Explanation) {
        jdbc.sql(
            "update rule set explanation = ?, explanation_model = ?, explanation_prompt_hash = ? where id = ? and explanation is null",
        ).params(explanation.text, explanation.modelId, explanation.promptHash, id).update()
    }

    private fun load(where: String, vararg args: Any): List<RuleVersion> {
        val variables = jdbc.sql(
            """
            select v.rule_id, v.position, v.name, v.agg, v.field, v.filter, v.window_kind,
                   extract(epoch from v.window_from)::bigint as from_seconds,
                   extract(epoch from v.window_to)::bigint as to_seconds
            from rule_variable v join rule r on r.id = v.rule_id
            where $where
            order by v.rule_id, v.position
            """,
        ).params(*args).query { rs, _ -> rs.getLong("rule_id") to variable(rs) }.list().groupBy({ it.first }, { it.second })

        val params = jdbc.sql("select p.rule_id, p.name, p.value, p.unit from rule_param p join rule r on r.id = p.rule_id where $where")
            .params(*args)
            .query { rs, _ ->
                Triple(rs.getLong("rule_id"), rs.getString("name"), Param(rs.getDouble("value"), ParamUnit.valueOf(rs.getString("unit").uppercase())))
            }.list()
            .groupBy({ it.first }, { it.second to it.third }).mapValues { it.value.toMap() }

        return jdbc.sql(
            """
            select r.id, r.key, r.version, r.alert_type, r.layer, r.scope_segment_id, r.scope_client_id, r.grain, r.anchor,
                   r.condition, r.replaces_key, r.name, r.status, r.author, r.created_at, r.explanation, r.explanation_model
            from rule r where $where order by r.key, r.version desc
            """,
        ).params(*args).query { rs, _ ->
            val id = rs.getLong("id")
            RuleVersion(
                rule = RuleDefinition(
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
                ),
                name = rs.getString("name"),
                status = rs.getString("status"),
                author = rs.getString("author"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                explanation = rs.getString("explanation"),
                explanationModel = rs.getString("explanation_model"),
            )
        }.list()
    }

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
