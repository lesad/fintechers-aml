package cz.morosystems.aml.engine.importer

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.LocalDate

class ParsingTest {
    @Test
    fun readsCzkToTheHeller() {
        assertThat(Parsing.czk("1234.56")).isEqualTo(1234.56)
    }

    @Test
    fun emptyCzkIsZero() {
        assertThat(Parsing.czk("")).isEqualTo(0.0)
    }

    @Test
    fun parsesDate() {
        assertThat(Parsing.date("05.06.2026")).isEqualTo(LocalDate.of(2026, 6, 5))
    }

    @Test
    fun mapsDirections() {
        assertThat(Parsing.direction("incoming payment")).isEqualTo("in")
        assertThat(Parsing.direction("outgoing payment")).isEqualTo("out")
        assertThat(Parsing.direction("remittance")).isEqualTo("unknown")
        assertThatThrownBy { Parsing.direction("barter") }.hasMessageContaining("barter")
    }

    @Test
    fun q2DaysCountsFromLaterOfContractAndQuarterStart() {
        assertThat(Parsing.q2Days(LocalDate.of(2025, 1, 10))).isEqualTo(91)
        assertThat(Parsing.q2Days(LocalDate.of(2026, 6, 1))).isEqualTo(30)
        assertThat(Parsing.q2Days(LocalDate.of(2026, 6, 30))).isEqualTo(1)
    }
}
