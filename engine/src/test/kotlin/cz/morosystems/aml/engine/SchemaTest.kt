package cz.morosystems.aml.engine

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.assertj.core.api.Assertions.assertThat

@PostgresTest
class SchemaTest(@Autowired private val jdbc: JdbcClient) {
    @Test
    fun seedsSixActiveCompanyRules() {
        val keys = jdbc.sql("select key from rule where status = 'active' and layer = 'company' order by key")
            .query(String::class.java).list()
        assertThat(keys).isEqualTo(listOf("A1", "A2", "A3", "B1", "B2", "C1"))
    }

    @Test
    fun c1HasThreeVariablesInOrder() {
        val names = jdbc.sql(
            "select name from rule_variable where rule_id = (select id from rule where key = 'C1' and version = 1) order by position",
        ).query(String::class.java).list()
        assertThat(names).isEqualTo(listOf("inflow", "payers", "outflow"))
    }

    @Test
    fun alertTypesHaveUnits() {
        val units = jdbc.sql("select code, unit from alert_type")
            .query { rs, _ -> rs.getString(1) to rs.getString(2) }.list().toMap()
        assertThat(units).isEqualTo(mapOf("A" to "client", "B" to "transaction", "C" to "client"))
    }
}
