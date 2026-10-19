package cz.morosystems.aml.engine

import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.testcontainers.postgresql.PostgreSQLContainer

/** Boots the full application context against a throwaway Postgres 17 container; Liquibase runs on start. */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest
@Import(PostgresTestContainer::class)
annotation class PostgresTest

@TestConfiguration(proxyBeanMethods = false)
class PostgresTestContainer {
    @Bean
    @ServiceConnection
    fun postgres() = PostgreSQLContainer("postgres:17-alpine")
}
