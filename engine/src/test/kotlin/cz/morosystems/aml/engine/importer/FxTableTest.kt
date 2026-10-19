package cz.morosystems.aml.engine.importer

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.LocalDate

class FxTableTest {
    private val fx = FxTable.parse(
        listOf(
            "Datum|1 EUR|100 JPY",
            "08.05.2026|24,400|13,600",
            "11.05.2026|24,300|92,500",
        ),
    )

    @Test
    fun dividesByQuantity() {
        assertThat(fx.ratePerUnit("JPY", LocalDate.of(2026, 5, 11))).isEqualByComparingTo("0.925")
    }

    @Test
    fun saturdayUsesFridayFixing() {
        assertThat(fx.ratePerUnit("EUR", LocalDate.of(2026, 5, 9))).isEqualByComparingTo("24.4")
    }

    @Test
    fun czkIsOne() {
        assertThat(fx.ratePerUnit("CZK", LocalDate.of(2000, 1, 1))).isEqualByComparingTo(BigDecimal.ONE)
    }

    @Test
    fun dateBeforeFirstFixingFailsNamingCurrency() {
        assertThatThrownBy { fx.ratePerUnit("EUR", LocalDate.of(2026, 5, 7)) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("no ČNB fixing for EUR on or before 2026-05-07")
    }

    @Test
    fun unknownCurrencyFails() {
        assertThatThrownBy { fx.ratePerUnit("XXX", LocalDate.of(2026, 5, 11)) }.hasMessageContaining("XXX")
    }

    @Test
    fun convertsToCzk() {
        assertThat(toCzk(BigDecimal("1000.00"), BigDecimal("24.50"))).isEqualTo(24500.0)
    }

    @Test
    fun roundsHalfUpToTheHeller() {
        assertThat(toCzk(BigDecimal("0.015"), BigDecimal("1"))).isEqualTo(0.02)
    }
}
