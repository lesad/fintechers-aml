package cz.morosystems.aml.engine.alert

import cz.morosystems.aml.engine.user.AppUser
import cz.morosystems.aml.engine.user.COMPLIANCE_MANAGER
import cz.morosystems.aml.engine.user.COMPLIANCE_OFFICER
import cz.morosystems.aml.engine.user.UserRepository
import java.io.Writer
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper

/**
 * Writes the FINREG alert CSV of one run: one row per alert, in the challenge's mandated columns.
 *
 * `triage` is the final decision: a person's false positive or escalation wins over the engine's disposition.
 * The executive is the case's assignee; the approver is a second person (four eyes) of a higher role, the
 * compliance manager for a PEP client. `log` is JSON: the triage inputs, the rule hits and the case's event log.
 */
@Component
class AlertCsv(private val jdbc: JdbcClient, private val users: UserRepository) {
    private val json = JsonMapper()

    fun write(runId: Long, out: Writer) {
        val people = users.all()
        out.write(HEADER.joinToString(",") + "\n")
        jdbc.sql(QUERY).param(runId).query { rs, _ ->
            val executive = people.firstOrNull { it.id == rs.getLong("assignee_id") } ?: people.first { it.role == "ANALYST" }
            val events = json.readTree(rs.getString("events")).iterator().asSequence().toList()
            val decided = events.lastOrNull { it["action"].asString() in DECISIONS }
            val disposition = rs.getString("disposition")
            val triage = when {
                decided != null -> if (decided["action"].asString() == "FALSE_POSITIVE") "FP" else "REVIEW"
                disposition == "AUTO_CLOSE" -> "FP"
                else -> "REVIEW"
            }
            val reasons = json.readTree(rs.getString("reasons")).iterator().asSequence().map { it["description"].asString() }.toList()
            val reason = buildString {
                append("$disposition, score ${rs.getInt("score")}: ${reasons.joinToString("; ")}.")
                decided?.let { append(" Final decision ${it["action"].asString()} by ${it["actor"].asString()}") }
                decided?.path("reason")?.takeIf { it.isString }?.let { append(": ${it.asString()}") }
            }
            listOf(
                rs.getLong("id").toString(),
                rs.getString("alert_type"),
                rs.getString("client_id"),
                rs.getString("transaction_id").orEmpty(),
                triage,
                rs.getInt("score").toString(),
                executive.role,
                executive.name,
                approver(executive, rs.getBoolean("pep"), people).name,
                reason,
                rs.getString("log"),
            ).joinToString(",") { quote(it) } + "\n"
        }.list().forEach(out::write)
    }

    private fun approver(executive: AppUser, pep: Boolean, people: List<AppUser>): AppUser {
        val role = if (pep || executive.role == COMPLIANCE_OFFICER) COMPLIANCE_MANAGER else COMPLIANCE_OFFICER
        return people.firstOrNull { it.role == role && it.id != executive.id }
            ?: people.first { it.role in setOf(COMPLIANCE_OFFICER, COMPLIANCE_MANAGER) && it.id != executive.id }
    }

    private fun quote(field: String) =
        if (field.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) "\"" + field.replace("\"", "\"\"") + "\"" else field

    private companion object {
        val HEADER = listOf(
            "alert_id", "alert_type", "client_id", "transaction_id", "triage", "priority",
            "executive_role", "executive_person", "approver", "reason", "log",
        )
        val DECISIONS = setOf("FALSE_POSITIVE", "ESCALATED", "REPORTED")

        const val QUERY = """
            select a.id, a.alert_type, a.client_id, a.transaction_id, a.assignee_id, coalesce(c.pep, false) as pep,
                   tr.disposition, tr.score, tr.reasons::text as reasons, ev.events::text as events,
                   jsonb_build_object(
                       'triage', jsonb_build_object('disposition', tr.disposition, 'score', tr.score,
                           'config_version', tr.config_version, 'input_hash', tr.input_hash, 'at', tr.decided_at),
                       'hits', (select coalesce(jsonb_agg(jsonb_build_object('rule', r.key, 'grain_key', h.grain_key) || h.evidence order by h.id), '[]')
                                from alert_hit ah join rule_hit h on h.id = ah.hit_id join rule r on r.id = h.rule_id
                                where ah.alert_id = a.id),
                       'events', ev.events
                   )::text as log
            from alert a
            join alert_triage tr on tr.alert_id = a.id
            left join client c on c.id = a.client_id
            cross join lateral (
                select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'action', e.action, 'actor', coalesce(u.name, 'engine'),
                           'assignee', s.name, 'reason', e.reason) order by e.id), '[]') as events
                from case_event e left join app_user u on u.id = e.actor_id left join app_user s on s.id = e.assignee_id
                where e.run_id = a.run_id and e.transaction_id = a.transaction_id
            ) ev
            where a.run_id = ? order by a.id
        """
    }
}
