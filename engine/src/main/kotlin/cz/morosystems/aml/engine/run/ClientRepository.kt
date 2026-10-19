package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.cel.Vocabulary
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository

@Repository
class ClientRepository(private val jdbc: JdbcClient) {
    /** Every client as a map keyed by the rule vocabulary's `client.*` field names. */
    fun findAll(): List<Map<String, Any?>> =
        jdbc.sql("select ${Vocabulary.client.keys.joinToString(", ")} from client order by id").query().listOfRows()

    fun highRiskList(): List<String> =
        jdbc.sql("select code from reference_list where list = 'high_risk' order by code").query(String::class.java).list().filterNotNull()

    fun alertUnits(): Map<String, String> =
        jdbc.sql("select code, unit from alert_type").query { rs, _ -> rs.getString(1) to rs.getString(2) }.list().toMap()
}
