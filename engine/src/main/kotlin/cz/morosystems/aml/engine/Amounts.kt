package cz.morosystems.aml.engine

import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale

/**
 * An amount as text: CZK, no exponent, no trailing `.0`. The one rendering every layer uses, so the same amount
 * reads the same in a prompt, a reason line and the input hash.
 *
 * @throws IllegalArgumentException for NaN or an infinity — neither is an amount, and both would hash as text.
 */
fun plain(value: Double): String {
    require(value.isFinite()) { "not a finite amount: $value" }
    return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString()
}

/**
 * [value] as an exact decimal, written plainly: a `Double` through [plain], any other number through its own text.
 * Jackson would otherwise write 11 000 000 CZK as `1.1E7`, which no reader — and no number check — recognises.
 */
fun plainDecimal(value: Number): BigDecimal =
    BigDecimal(if (value is Double || value is Float) plain(value.toDouble()) else value.toString())

/**
 * [value] as a reviewer reads it: `CZK 593,425.83`, `CZK 250,000`. Grouped, to the heller, and the heller only
 * when there is one. For a sentence a person reads — [plain] stays the exact form for hashes and machine input.
 */
fun money(value: Double): String {
    val heller = BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP)
    val digits = if (heller.stripTrailingZeros().scale() <= 0) 0 else 2
    return "CZK " + String.format(Locale.US, "%,.${digits}f", heller)
}
