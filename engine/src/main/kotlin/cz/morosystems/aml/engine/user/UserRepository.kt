package cz.morosystems.aml.engine.user

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository

/** A person who works the queue: a reviewer takes the first line, a manager the escalated cases. */
data class AppUser(val id: Long, val name: String, val role: String) {
    /** The case statuses this user's queue holds. */
    val queueStatuses: List<String>
        get() = if (role == "MANAGER") listOf("ESCALATED", "REPORTED") else listOf("NEW", "FALSE_POSITIVE")
}

@Repository
class UserRepository(private val jdbc: JdbcClient) {
    fun all(): List<AppUser> =
        jdbc.sql("select id, name, role from app_user order by id")
            .query { rs, _ -> AppUser(rs.getLong("id"), rs.getString("name"), rs.getString("role")) }.list()

    fun find(id: Long): AppUser? =
        jdbc.sql("select id, name, role from app_user where id = ?").param(id)
            .query { rs, _ -> AppUser(rs.getLong("id"), rs.getString("name"), rs.getString("role")) }.optional().orElse(null)

    fun exists(id: Long): Boolean =
        jdbc.sql("select exists (select 1 from app_user where id = ?)").param(id).query(Boolean::class.java).single()
}
