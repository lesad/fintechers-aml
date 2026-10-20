package cz.morosystems.aml.engine.user

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository

/**
 * A person in the app (ADR-0051): an `ANALYST` works the queue and escalates, the `COMPLIANCE_OFFICER` decides
 * escalated cases, files reports and approves rules and triage configs, the `COMPLIANCE_MANAGER` oversees.
 */
data class AppUser(val id: Long, val name: String, val role: String)

const val COMPLIANCE_OFFICER = "COMPLIANCE_OFFICER"
const val COMPLIANCE_MANAGER = "COMPLIANCE_MANAGER"

/** The roles that may approve what someone else wrote: the compliance officer's level and above. */
val APPROVER_ROLES = setOf(COMPLIANCE_OFFICER, COMPLIANCE_MANAGER)

@Repository
class UserRepository(private val jdbc: JdbcClient) {
    fun all(): List<AppUser> =
        jdbc.sql("select id, name, role from app_user order by id")
            .query { rs, _ -> AppUser(rs.getLong("id"), rs.getString("name"), rs.getString("role")) }.list()

    fun find(id: Long): AppUser? = all().firstOrNull { it.id == id }

    fun exists(id: Long): Boolean =
        jdbc.sql("select exists (select 1 from app_user where id = ?)").param(id).query(Boolean::class.java).single()
}
