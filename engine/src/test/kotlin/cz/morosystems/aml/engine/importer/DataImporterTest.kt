package cz.morosystems.aml.engine.importer

import cz.morosystems.aml.engine.EngineProperties
import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.nio.file.Files
import java.nio.file.Path

@PostgresTest
class DataImporterTest(
    @Autowired private val jdbc: JdbcClient,
    @Autowired private val tx: PlatformTransactionManager,
) {
    private val fixtures: Path = Path.of("src/test/resources/fixtures/import")

    private fun propsFor(dir: Path) = EngineProperties(dataDir = dir, referenceList = fixtures.resolve("high-risk.json"))

    private fun importFrom(dir: Path): ImportReport =
        TransactionTemplate(tx).execute { DataImporter(jdbc, propsFor(dir)).import() }

    private fun count(table: String) = jdbc.sql("select count(*) from $table").query(Int::class.java).single()

    private fun variant(dir: Path, file: String, edit: (String) -> String): Path {
        fixtures.toFile().copyRecursively(dir.toFile(), overwrite = true)
        val target = dir.resolve(file)
        Files.writeString(target, edit(Files.readString(target)))
        return dir
    }

    @Test
    fun importsRowsAndReports() {
        val report = importFrom(fixtures)
        assertThat(report).isEqualTo(ImportReport(clients = 3, transactions = 6, fxRates = 9, listCodes = 4, clientsWithoutQ2 = 1))
        assertThat(count("client")).isEqualTo(3)
        assertThat(count("transaction")).isEqualTo(6)
    }

    @Test
    fun convertsForeignCurrencyAndKeepsOriginal() {
        importFrom(fixtures)
        val row = jdbc.sql("select amount, volume, currency, fx_rate, direction, ts from transaction where id = 'T000001'")
            .query { rs, _ ->
                listOf(rs.getLong("amount"), rs.getBigDecimal("volume"), rs.getString("currency"), rs.getBigDecimal("fx_rate"), rs.getString("direction"), rs.getTimestamp("ts").toLocalDateTime())
            }.single()
        assertThat(row[0]).isEqualTo(2435000L)
        assertThat(row[1] as java.math.BigDecimal).isEqualByComparingTo("1000.00")
        assertThat(row[2]).isEqualTo("EUR")
        assertThat(row[3] as java.math.BigDecimal).isEqualByComparingTo("24.35")
        assertThat(row[4]).isEqualTo("in")
        assertThat(row[5].toString()).isEqualTo("2026-05-04T10:15")
    }

    @Test
    fun usesFridayFixingForSaturdayTransaction() {
        importFrom(fixtures)
        val amount = jdbc.sql("select amount from transaction where id = 'T000003'").query(Long::class.java).single()
        assertThat(amount).isEqualTo(220000L)
    }

    @Test
    fun bomPrefixedFirstHeaderStillMapsToClientId() {
        importFrom(fixtures)
        val ids = jdbc.sql("select id from client order by id").query(String::class.java).list()
        assertThat(ids).containsExactly("K000001", "K000002", "K000003")
    }

    @Test
    fun clientsFieldsAreTypedAndInHalere() {
        importFrom(fixtures)
        val row = jdbc.sql("select pep, channel, type, expected_monthly_volume, q2_volume, q2_days, risk from client where id = 'K000002'")
            .query { rs, _ -> listOf(rs.getBoolean(1), rs.getString(2), rs.getString(3), rs.getLong(4), rs.getLong(5), rs.getInt(6), rs.getString(7)) }
            .single()
        assertThat(row).containsExactly(true, "distant form", "legal entity", 100000000L, 25000000L, 21, "high")
    }

    @Test
    fun clientWithEmptyQ2FieldsGetsZeros() {
        importFrom(fixtures)
        val row = jdbc.sql("select q2_tx_count, q2_max_tx from client where id = 'K000003'")
            .query { rs, _ -> rs.getInt(1) to rs.getLong(2) }.single()
        assertThat(row).isEqualTo(0 to 0L)
    }

    @Test
    fun reimportIsIdempotent() {
        importFrom(fixtures)
        importFrom(fixtures)
        assertThat(count("client")).isEqualTo(3)
        assertThat(count("transaction")).isEqualTo(6)
        assertThat(count("fx_rate")).isEqualTo(9)
        assertThat(count("reference_list")).isEqualTo(4)
    }

    @Test
    fun referenceListKeepsNamibiaAsNa() {
        importFrom(fixtures)
        val codes = jdbc.sql("select code from reference_list where list = 'high_risk' order by code").query(String::class.java).list()
        assertThat(codes).containsExactly("AF", "IR", "KP", "NA")
        val meta = jdbc.sql("select distinct valid_for, source from reference_list")
            .query { rs, _ -> rs.getString(1) to rs.getString(2) }.single()
        assertThat(meta).isEqualTo("2026-07" to "hand-made")
    }

    @Test
    fun unknownCurrencyRollsBackEverything(@TempDir dir: Path) {
        importFrom(fixtures)
        val bad = variant(dir, "CNB/transactions.csv") { it.replace(";EUR;", ";XYZ;") }
        assertThatThrownBy { importFrom(bad) }.hasMessageContaining("XYZ")
        assertThat(count("transaction")).isEqualTo(6)
    }

    @Test
    fun unknownCurrencyOnFreshDatabaseLeavesNoTransactions(@TempDir dir: Path) {
        jdbc.sql("truncate transaction, client, fx_rate, reference_list").update()
        val bad = variant(dir, "CNB/transactions.csv") { it.replace(";EUR;", ";XYZ;") }
        assertThatThrownBy { importFrom(bad) }.hasMessageContaining("XYZ")
        assertThat(count("transaction")).isEqualTo(0)
    }

    @Test
    fun transactionForUnknownClientNamesTransactionId(@TempDir dir: Path) {
        importFrom(fixtures)
        val bad = variant(dir, "CNB/transactions.csv") { it.replace("T000004;K000002", "T000004;K999999") }
        assertThatThrownBy { importFrom(bad) }.hasMessageContaining("T000004").hasMessageContaining("K999999")
        assertThat(count("client")).isEqualTo(3)
        assertThat(count("transaction")).isEqualTo(6)
    }
}
