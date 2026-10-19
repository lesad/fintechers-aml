package cz.morosystems.aml.engine

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient

@PostgresTest
class EngineApplicationTest(@Autowired private val jdbc: JdbcClient) {
    @Test
    fun contextLoads() {
        val tables = jdbc.sql("select count(*) from information_schema.tables where table_name = 'databasechangelog'")
            .query(Int::class.java).single()
        assertThat(tables).isEqualTo(1)
    }
}
