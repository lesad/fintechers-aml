package cz.morosystems.aml.engine.run

import cz.morosystems.aml.engine.rules.Grain
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component

/**
 * Chooses the one transaction a per-client alert points at in the CSV.
 *
 * @remarks Transaction hits win (A3: the largest one); otherwise the largest transaction on the day hit with the
 * highest `day_volume` (A1/A2), or the largest incoming payment in the 24 h window of the anchor hit that forwarded
 * the highest share (C1).
 */
@Component
class TransactionPicker(private val jdbc: JdbcClient) {
    fun pick(alert: AlertDraft): String? {
        alert.transactionId?.let { return it }
        val byGrain = alert.hits.groupBy { it.grain }

        byGrain[Grain.TRANSACTION]?.let { hits ->
            return hits.sortedWith(compareByDescending<Hit> { it.long("tx.amount") }.thenBy { it.grainKey }).first().grainKey
        }
        byGrain[Grain.CLIENT_DAY]?.let { hits ->
            val day = hits.sortedWith(compareByDescending<Hit> { it.long("day_volume") }.thenBy { it.grainKey }).first()
            return jdbc.sql(
                "select id from transaction where client_id = ? and ts >= ?::date and ts < ?::date + 1 order by amount desc, ts, id limit 1",
            ).params(alert.clientId, day.grainKey, day.grainKey).query(String::class.java).optional().orElse(null)
        }
        byGrain[Grain.CLIENT_ANCHOR]?.let { hits ->
            val strongest = hits.sortedWith(
                compareByDescending<Hit> { it.share() }.thenByDescending { it.long("inflow") }.thenBy { it.grainKey },
            ).first()
            return jdbc.sql(
                """
                select t.id from transaction t join transaction a on a.id = ?
                where t.client_id = a.client_id and t.direction = 'in' and t.ts > a.ts - interval '24 hours' and t.ts <= a.ts
                order by t.amount desc, t.ts, t.id limit 1
                """,
            ).param(strongest.grainKey).query(String::class.java).optional().orElse(strongest.grainKey)
        }
        return null
    }

    private fun Hit.long(name: String) = (evidence[name] as? Number)?.toLong() ?: 0L

    private fun Hit.share(): Double {
        val inflow = long("inflow")
        return if (inflow == 0L) 0.0 else long("outflow").toDouble() / inflow
    }
}
