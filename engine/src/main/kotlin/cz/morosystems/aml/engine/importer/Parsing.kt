package cz.morosystems.aml.engine.importer

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

object Parsing {
    private val DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy")
    private val QUARTER_START = LocalDate.of(2026, 4, 1)
    private val QUARTER_END = LocalDate.of(2026, 6, 30)

    /** Decimal-point CZK to haléře; an empty cell is 0. */
    fun czk(text: String): Long =
        if (text.isBlank()) 0L else BigDecimal(text.trim()).movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact()

    fun date(text: String): LocalDate = LocalDate.parse(text.trim(), DATE)

    fun direction(type: String): String = when (type.trim()) {
        "incoming payment" -> "in"
        "outgoing payment" -> "out"
        "remittance" -> "unknown"
        else -> error("unknown transaction type '$type'")
    }

    /** Calendar days from the later of the contract date and 1 April 2026 to 30 June 2026, inclusive. */
    fun q2Days(contract: LocalDate): Int =
        (ChronoUnit.DAYS.between(maxOf(contract, QUARTER_START), QUARTER_END) + 1).toInt().coerceAtLeast(0)
}
