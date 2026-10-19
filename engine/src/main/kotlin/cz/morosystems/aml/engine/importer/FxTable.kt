package cz.morosystems.aml.engine.importer

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.util.TreeMap

data class Fixing(val date: LocalDate, val currency: String, val quantity: Int, val rate: BigDecimal)

class FxTable private constructor(val fixings: List<Fixing>) {
    private val byCurrency: Map<String, TreeMap<LocalDate, Fixing>> =
        fixings.groupBy { it.currency }.mapValues { (_, list) -> TreeMap(list.associateBy { it.date }) }

    /** CZK per one unit of [currency], from the last fixing on or before [date]. */
    fun ratePerUnit(currency: String, date: LocalDate): BigDecimal {
        if (currency == "CZK") return BigDecimal.ONE
        val fixing = byCurrency[currency]?.floorEntry(date)?.value
            ?: throw IllegalStateException("no ČNB fixing for $currency on or before $date")
        return fixing.rate.divide(BigDecimal(fixing.quantity), 10, RoundingMode.HALF_UP)
    }

    companion object {
        fun of(fixings: List<Fixing>) = FxTable(fixings)

        fun parse(lines: List<String>): FxTable {
            val columns = lines.first().removePrefix("﻿").split('|').drop(1).map {
                val (quantity, code) = it.trim().split(' ')
                quantity.toInt() to code
            }
            val fixings = lines.drop(1).filter { it.isNotBlank() }.flatMap { line ->
                val cells = line.split('|')
                val date = Parsing.date(cells.first())
                columns.mapIndexed { i, (quantity, code) ->
                    Fixing(date, code, quantity, BigDecimal(cells[i + 1].trim().replace(',', '.')))
                }
            }
            return FxTable(fixings)
        }
    }
}

/** CZK for [volume] at [ratePerUnit] CZK per unit, rounded to the heller. */
fun toCzk(volume: BigDecimal, ratePerUnit: BigDecimal): Double =
    volume.multiply(ratePerUnit).setScale(2, RoundingMode.HALF_UP).toDouble()
