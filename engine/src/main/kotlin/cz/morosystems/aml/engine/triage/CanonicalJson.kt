package cz.morosystems.aml.engine.triage

import cz.morosystems.aml.engine.plain
import java.math.BigDecimal
import java.math.BigInteger
import java.security.MessageDigest
import java.time.LocalDate

/**
 * Canonical JSON, written by hand because the hash is only worth anything if the byte order is pinned:
 * object keys sorted, sets sorted by their rendered form, no insignificant whitespace, no library field order.
 *
 * Money in this engine is CZK as a `Double`, so floating point is rendered — but through [plain], never through
 * `toString()`: one decimal form per value, no exponent, no trailing `.0`, so `25.0` and `25` hash alike and a
 * rounding difference cannot hide behind a different spelling. NaN and the infinities are rejected: neither is
 * an amount, and both would otherwise hash as text.
 */
object CanonicalJson {
    fun render(value: Any?): String = StringBuilder().also { write(value, it) }.toString()

    /** Lowercase hex SHA-256 of the canonical rendering. */
    fun sha256(value: Any?): String =
        MessageDigest.getInstance("SHA-256")
            .digest(render(value).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    private fun write(value: Any?, out: StringBuilder) {
        when (value) {
            null -> out.append("null")
            is String -> writeString(value, out)
            is Boolean -> out.append(value)
            is Int, is Long, is Short, is Byte, is BigInteger -> out.append(value)
            // jsonb round-trips an integral amount as a decimal; keep it exact and reject a fractional one below.
            is BigDecimal -> out.append(value.stripTrailingZeros().toPlainString())
            is Enum<*> -> writeString(value.name, out)
            is LocalDate -> writeString(value.toString(), out)
            is Map<*, *> -> writeMap(value, out)
            is Set<*> -> writeSorted(value, out)
            is Collection<*> -> writeList(value, out)
            is Array<*> -> writeList(value.asList(), out)
            is Double -> out.append(plain(value))
            is Float -> out.append(plain(value.toDouble()))
            else -> error("not canonically serialisable: ${value::class.qualifiedName}")
        }
    }

    private fun writeMap(value: Map<*, *>, out: StringBuilder) {
        out.append('{')
        value.entries
            .map { (key, entry) -> (key as? String ?: error("map keys must be strings, got $key")) to entry }
            .sortedBy { it.first }
            .forEachIndexed { index, (key, entry) ->
                if (index > 0) out.append(',')
                writeString(key, out)
                out.append(':')
                write(entry, out)
            }
        out.append('}')
    }

    private fun writeList(value: Collection<*>, out: StringBuilder) {
        out.append('[')
        value.forEachIndexed { index, element ->
            if (index > 0) out.append(',')
            write(element, out)
        }
        out.append(']')
    }

    /** A set has no order of its own, so it gets one: its elements' canonical renderings, sorted. */
    private fun writeSorted(value: Set<*>, out: StringBuilder) {
        out.append('[')
        value.map { render(it) }.sorted().forEachIndexed { index, rendered ->
            if (index > 0) out.append(',')
            out.append(rendered)
        }
        out.append(']')
    }

    private fun writeString(value: String, out: StringBuilder) {
        out.append('"')
        value.forEach { char ->
            when {
                char == '"' -> out.append("\\\"")
                char == '\\' -> out.append("\\\\")
                char == '\n' -> out.append("\\n")
                char == '\r' -> out.append("\\r")
                char == '\t' -> out.append("\\t")
                char < ' ' -> out.append("\\u%04x".format(char.code))
                else -> out.append(char)
            }
        }
        out.append('"')
    }
}
