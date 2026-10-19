package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.plainDecimal
import cz.morosystems.aml.engine.summary.Activity
import cz.morosystems.aml.engine.triage.TriageRepository
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

private const val MAX_COUNTERPARTIES = 5
private val ROUND_FLOOR = BigDecimal(10_000)
private val ROUND_STEP = BigDecimal(1_000)
private val JUST_UNDER = BigDecimal("0.9")

private data class Flagged(
    val id: String,
    val ts: LocalDateTime,
    val amount: BigDecimal,
    val currency: String,
    val direction: String,
    val payerAccount: String?,
    val payeeAccount: String?,
    val payerCountry: String?,
    val payeeCountry: String?,
) {
    /** The other side of the payment: the payee on an outflow, the payer on an inflow. */
    val account: String? get() = if (direction == "out") payeeAccount else if (direction == "in") payerAccount else null
    val country: String? get() = if (direction == "out") payeeCountry else payerCountry
}

private data class AlertRow(val runId: Long, val type: String, val clientId: String)

/**
 * What code knows about an alert beyond its rule hits: the client against its Q2 baseline, the counterparties,
 * the money flow and the client's other alerts. Everything the model may cite is computed here, so it never counts
 * or compares; the ratios are `BigDecimal` rounded half up, so the same alert always reads the same.
 */
@Repository
class AlertFacts(private val jdbc: JdbcClient) {
    private val json = JsonMapper()
    private val triage = TriageRepository(jdbc)

    fun collect(alertId: Long): List<Activity> {
        val alert = jdbc.sql("select run_id, alert_type, client_id from alert where id = ?").param(alertId)
            .query { rs, _ -> AlertRow(rs.getLong(1), rs.getString(2), rs.getString(3)) }.single()
        val flagged = flagged(alertId, alert.clientId)
        val hits = hitEvidence(alertId)
        val counterparties = counterparties(alert.clientId, flagged)
        val items = mapOf(
            "profile" to listOf(profile(alert, flagged)),
            "alerts" to listOf(otherAlerts(alertId, alert)),
            "flow" to listOf(flow(alert.clientId, flagged, hits, counterparties.omitted)),
            "counterparties" to counterparties.items,
        )
        val order = when (alert.type) {
            "A" -> listOf("profile", "alerts", "flow", "counterparties")
            "B" -> listOf("profile", "counterparties", "flow", "alerts")
            else -> listOf("flow", "counterparties", "profile", "alerts")
        }
        return order.flatMap { items.getValue(it) }
    }

    /** The alert's own transaction, else the client's transactions named by a hit's grain key: a transaction id or a day. */
    private fun flagged(alertId: Long, clientId: String): List<Flagged> =
        jdbc.sql(
            """
            select t.id, t.ts, t.amount, t.currency, t.direction, t.payer_account, t.payee_account, t.payer_country, t.payee_country
            from alert a join transaction t on t.client_id = a.client_id
            where a.id = :alert and t.client_id = :client and (
                t.id = a.transaction_id or (a.transaction_id is null and exists (
                    select 1 from alert_hit ah join rule_hit h on h.id = ah.hit_id
                    where ah.alert_id = a.id and (h.grain_key = t.id or h.grain_key = to_char(t.ts, 'YYYY-MM-DD'))
                )))
            order by t.ts, t.id
            """.trimIndent(),
        ).param("alert", alertId).param("client", clientId).query { rs, _ ->
            Flagged(
                rs.getString(1), rs.getTimestamp(2).toLocalDateTime(), plainDecimal(rs.getDouble(3)), rs.getString(4), rs.getString(5),
                rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9),
            )
        }.list()

    /** Evidence values of each `p.` parameter whose unit is an amount, as parameter to the distinct thresholds the hits recorded. */
    private fun hitEvidence(alertId: Long): Map<String, List<BigDecimal>> {
        val rows = jdbc.sql(
            """
            select h.evidence::text,
                   (select coalesce(jsonb_object_agg('p.' || p.name, p.unit), '{}') from rule_param p where p.rule_id = h.rule_id)::text
            from alert_hit ah join rule_hit h on h.id = ah.hit_id where ah.alert_id = ? order by h.id
            """.trimIndent(),
        ).param(alertId).query { rs, _ ->
            json.readValue(rs.getString(1), Map::class.java) to json.readValue(rs.getString(2), Map::class.java)
        }.list()
        return rows.flatMap { (evidence, units) ->
            units.filterValues { it == "amount" }.keys.map { it.toString() }.mapNotNull { name ->
                (evidence[name] as? Number)?.let { name to plainDecimal(it) }
            }
        }.groupBy({ it.first }, { it.second }).mapValues { it.value.distinct() }.toSortedMap()
    }

    private fun profile(alert: AlertRow, flagged: List<Flagged>): Activity {
        val row = jdbc.sql(
            """
            select type, country, channel, pep, risk, contract_date, expected_monthly_volume, expected_count,
                   q2_volume, q2_tx_count, q2_max_tx, q2_days
            from client where id = ?
            """.trimIndent(),
        ).param(alert.clientId).query { rs, _ ->
            fun money(column: Int) = rs.getDouble(column).takeUnless { rs.wasNull() }?.let(::plainDecimal)
            fun count(column: Int) = rs.getInt(column).takeUnless { rs.wasNull() }
            val contract = rs.getDate(6)?.toLocalDate()
            mapOf(
                "type" to rs.getString(1), "country" to rs.getString(2), "channel" to rs.getString(3),
                "pep" to rs.getBoolean(4).takeUnless { rs.wasNull() }, "risk" to rs.getString(5),
                "contract" to contract,
                "expectedMonthlyVolume" to money(7), "expectedCount" to count(8),
                "q2Volume" to money(9), "q2TxCount" to count(10), "q2MaxTx" to money(11), "q2Days" to count(12),
            )
        }.optional().orElse(null) ?: return Activity("client:profile", "client_profile", emptyMap())

        val asOf = triage.periodTo(alert.runId)?.minusDays(1)
        val contract = row["contract"] as LocalDate?
        val flaggedDay = flagged.groupBy { it.ts.toLocalDate() }.values.maxOfOrNull { day -> day.sumOf { it.amount } } ?: BigDecimal.ZERO
        val largest = flagged.maxOfOrNull { it.amount } ?: BigDecimal.ZERO
        val q2Volume = row["q2Volume"] as BigDecimal?
        val q2MaxTx = row["q2MaxTx"] as BigDecimal?
        val q2Days = row["q2Days"] as Int?
        val hasBaseline = (q2Days ?: 0) > 0 && ((row["q2TxCount"] as Int?) ?: 0) > 0 &&
            (q2Volume ?: BigDecimal.ZERO).signum() > 0 && (q2MaxTx ?: BigDecimal.ZERO).signum() > 0

        val data = linkedMapOf<String, Any?>(
            "type" to row["type"], "country" to row["country"], "channel" to row["channel"], "pep" to row["pep"], "risk" to row["risk"],
            "tenureMonths" to if (contract != null && asOf != null) ChronoUnit.MONTHS.between(contract, asOf) else null,
            "expectedMonthlyVolume" to row["expectedMonthlyVolume"], "expectedCount" to row["expectedCount"],
            "q2Volume" to q2Volume, "q2TxCount" to row["q2TxCount"], "q2MaxTx" to q2MaxTx, "q2Days" to q2Days,
            "flaggedDayVolume" to flaggedDay, "largestAmount" to largest,
        )
        if (hasBaseline) {
            // day / (q2Volume / q2Days), multiplied out first so the division happens once.
            data["dayVsQ2AvgDay"] = flaggedDay.multiply(BigDecimal(q2Days!!)).divide(q2Volume!!, 1, RoundingMode.HALF_UP).toPlainString()
            data["largestVsQ2MaxTx"] = largest.divide(q2MaxTx!!, 1, RoundingMode.HALF_UP).toPlainString()
        } else {
            data["baseline"] = "missing"
        }
        return Activity("client:profile", "client_profile", data)
    }

    private class Counterparties(val items: List<Activity>, val omitted: Int)

    private fun counterparties(clientId: String, flagged: List<Flagged>): Counterparties {
        val byAccount = flagged.filter { it.account != null }.groupBy { it.account!! }
        val ranked = byAccount.entries.sortedWith(compareByDescending<Map.Entry<String, List<Flagged>>> { e -> e.value.maxOf { it.amount } }.thenBy { it.key })
        val items = ranked.take(MAX_COUNTERPARTIES).map { (account, txs) ->
            val country = txs.first().country
            val firstFlagged = txs.minOf { it.ts }
            val highRisk = country != null &&
                jdbc.sql("select exists (select 1 from reference_list where list = 'high_risk' and code = ?)").param(country).query(Boolean::class.java).single()
            val firstSeen = jdbc.sql("select min(ts)::date from transaction where payer_account = ? or payee_account = ?")
                .params(account, account).query(LocalDate::class.java).single()
            val earlier = jdbc.sql(
                """
                select count(*), min(amount), max(amount) from transaction
                where client_id = ? and (payer_account = ? or payee_account = ?) and ts < ?
                """.trimIndent(),
            ).params(clientId, account, account, java.sql.Timestamp.valueOf(firstFlagged)).query { rs, _ ->
                val count = rs.getInt(1)
                if (count == 0) mapOf("count" to 0) else mapOf("count" to count, "min" to plainDecimal(rs.getDouble(2)), "max" to plainDecimal(rs.getDouble(3)))
            }.single()
            val otherClients = jdbc.sql("select count(distinct client_id) from transaction where client_id <> ? and (payer_account = ? or payee_account = ?)")
                .params(clientId, account, account).query(Int::class.java).single()
            Activity(
                ref = "counterparty:$account",
                kind = "counterparty",
                data = mapOf(
                    "account" to account, "country" to country, "highRiskCountry" to highRisk, "firstSeen" to firstSeen.toString(),
                    "earlierWithClient" to earlier, "otherClients" to otherClients,
                ),
            )
        }
        return Counterparties(items, maxOf(0, ranked.size - MAX_COUNTERPARTIES))
    }

    private fun flow(clientId: String, flagged: List<Flagged>, thresholds: Map<String, List<BigDecimal>>, omitted: Int): Activity {
        val firstIn = flagged.firstOrNull { it.direction == "in" }
        val nextOut = firstIn?.let { inflow ->
            jdbc.sql("select min(ts) from transaction where client_id = ? and direction = 'out' and ts > ?")
                .params(clientId, java.sql.Timestamp.valueOf(inflow.ts)).query { rs, _ -> rs.getTimestamp(1)?.toLocalDateTime() }.single()
        }
        val forwarded = firstIn?.takeIf { it.amount.signum() > 0 }?.let { inflow ->
            val out = jdbc.sql("select coalesce(sum(amount), 0) from transaction where client_id = ? and direction = 'out' and ts > ? and ts <= ?")
                .params(clientId, java.sql.Timestamp.valueOf(inflow.ts), java.sql.Timestamp.valueOf(inflow.ts.plusHours(24)))
                .query(Double::class.java).single()
            plainDecimal(out).multiply(BigDecimal(100)).divide(inflow.amount, 0, RoundingMode.HALF_UP).toPlainString()
        }
        val justUnder = thresholds.flatMap { (parameter, values) ->
            values.flatMap { threshold ->
                flagged.map { it.amount }.filter { it >= threshold.multiply(JUST_UNDER) && it < threshold }.sorted()
                    .map { mapOf("amount" to it, "parameter" to parameter, "threshold" to threshold) }
            }
        }
        return Activity(
            ref = "flow:activity",
            kind = "flow",
            data = mapOf(
                "flaggedCount" to flagged.size,
                "inCount" to flagged.count { it.direction == "in" },
                "outCount" to flagged.count { it.direction == "out" },
                "minutesInToNextOut" to if (firstIn != null && nextOut != null) Duration.between(firstIn.ts, nextOut).toMinutes() else null,
                "forwardedPercent" to forwarded,
                "roundAmounts" to flagged.count { it.amount >= ROUND_FLOOR && it.amount.remainder(ROUND_STEP).signum() == 0 },
                "justUnderThreshold" to justUnder,
                "foreignCurrency" to flagged.count { it.currency != "CZK" },
                "omittedCounterparties" to omitted,
            ),
        )
    }

    private fun otherAlerts(alertId: Long, alert: AlertRow): Activity {
        val others = jdbc.sql(
            """
            select a.alert_type, t.disposition, a.status from alert a left join alert_triage t on t.alert_id = a.id
            where a.run_id = ? and a.client_id = ? and a.id <> ? order by a.id
            """.trimIndent(),
        ).params(alert.runId, alert.clientId, alertId).query { rs, _ ->
            mapOf("alertType" to rs.getString(1), "disposition" to rs.getString(2), "status" to rs.getString(3))
        }.list()
        return Activity("client:alerts", "client_alerts", mapOf("alerts" to others))
    }
}
