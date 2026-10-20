package cz.morosystems.aml.engine.triage

import java.sql.ResultSet
import java.time.OffsetDateTime
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

/**
 * A stored triage config version: the lifecycle around the pure value a decision is taken with. The direct analogue
 * of [cz.morosystems.aml.engine.rules.RuleVersion]; [status] is `draft`, `pending`, `approved`, `active` or `retired`.
 *
 * @property assignee the compliance officer a `pending` version waits for, by name
 */
data class TriageConfigVersion(
    val id: Long,
    val version: Int,
    val config: TriageConfig,
    val status: String,
    val author: String?,
    val createdAt: OffsetDateTime,
    val assignee: String? = null,
    val approver: String? = null,
    val approvedAt: OffsetDateTime? = null,
)

/**
 * A config version as its author submits it: the whole policy as the value a decision would be taken with, already
 * validated by [TriageConfig]'s own init.
 *
 * [TriageConfig.configVersion] on it is a placeholder and is ignored — code assigns the version number (max + 1), so
 * the caller can never choose it. Use [TriageConfigRepository.configVersion] with `0` (`triage-v0`) where one has to
 * be supplied. [TriageConfig.highRiskCountries], [TriageConfig.alertTypeNames] and [TriageConfig.ruleNames] are not
 * stored either: they are overlaid from elsewhere at decision time.
 */
data class NewTriageConfig(val config: TriageConfig, val author: String)

/**
 * Every version of the triage config, insert-only. Nothing here edits a stored version: a change is a new row, and
 * [activate] only moves which row is the live one, so a decision already taken stays readable under its own config.
 *
 * The policy lives in real columns and child tables rather than one document, so a one-field edit writes one row.
 * Ordered children carry a `position` that preserves the authored order and are always read back in it — that order
 * is part of the decision (which amount band wins, in which order floors and missing-data reasons are listed).
 */
@Repository
class TriageConfigRepository(private val jdbc: JdbcClient) {
    /** The live config. A run must never fall back to a default, so a database with no active version is an error. */
    fun active(): TriageConfigVersion =
        load("c.status = 'active'").singleOrNull() ?: error("no active triage config; seed or activate one before triaging")

    /** Every stored version, newest version first. */
    fun allVersions(): List<TriageConfigVersion> = load("true")

    fun find(version: Int): TriageConfigVersion? = load("c.version = ?", version).singleOrNull()

    /** The versions still being decided — a `draft` being written and a `pending` one waiting for its approver. */
    fun open(): List<TriageConfigVersion> = load("c.status in ('draft', 'pending')")

    /** The keys of every live rule, to be read against the active config's scores. Detection, not policy — hence `rule`. */
    fun liveRuleKeys(): Set<String> =
        jdbc.sql("select distinct key from rule where status = 'active'").query(String::class.java).list().filterNotNull().toSet()

    /** Stores [draft] as a `draft` with the next version number; returns the new id. */
    @Transactional
    fun insertDraft(draft: NewTriageConfig): Long {
        val c = draft.config
        val id = jdbc.sql(
            """
            insert into triage_config ($CONFIG_COLUMNS, status, author)
            select coalesce(max(version), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ? from triage_config
            returning id
            """,
        ).params(
            listOf(
                c.unknownRuleScore, c.perExtraRule, c.extraRuleMax, c.factors.pep, c.factors.highRiskCountry,
                c.factors.staticCap, c.factors.unbaselinedClient, c.factors.tenureUnder90Days,
                c.factors.tenureUnder365Days, c.factors.perExtraAlertType, c.factors.extraAlertTypeMax, draft.author,
            ),
        ).query(Long::class.java).single()

        insertChildren(id, c)
        return id
    }

    /**
     * Copies [fromVersion] into the next version as a `draft` and returns the new id. The copy happens in SQL, child
     * table by child table — no document is read into the JVM and rewritten — which is what makes editing one field
     * of the policy cheap and keeps two concurrent editors from clobbering each other.
     */
    @Transactional
    fun copyAsDraft(fromVersion: Int, author: String): Long {
        val fromId = jdbc.sql("select id from triage_config where version = ?").param(fromVersion)
            .query(Long::class.java).optional().orElse(null) ?: error("triage config version $fromVersion not found")

        val id = jdbc.sql(
            """
            insert into triage_config ($CONFIG_COLUMNS, status, author)
            select (select coalesce(max(version), 0) + 1 from triage_config),
                   unknown_rule_score, per_extra_rule, extra_rule_max, factor_pep, factor_high_risk_country,
                   factor_static_cap, factor_unbaselined_client, factor_tenure_under_90_days,
                   factor_tenure_under_365_days, factor_per_extra_alert_type, factor_extra_alert_type_max,
                   'draft', ?
            from triage_config where id = ?
            returning id
            """,
        ).params(author, fromId).query(Long::class.java).single()

        CHILD_TABLES.forEach { (table, columns) ->
            jdbc.sql("insert into $table (config_id, $columns) select ?, $columns from $table where config_id = ?")
                .params(id, fromId).update()
        }
        return id
    }

    /**
     * Promotes [version] and retires whatever was active, in one transaction. The partial unique index on
     * `status = 'active'` is what actually guarantees there is never more than one.
     */
    @Transactional
    fun activate(version: Int) {
        jdbc.sql("update triage_config set status = 'retired' where status = 'active' and version <> ?").param(version).update()
        val promoted = jdbc.sql("update triage_config set status = 'active' where version = ?").param(version).update()
        if (promoted == 0) error("triage config version $version not found")
    }

    /** Moves the draft [version] to `pending`, assigned to [approverId]; false when [version] is no draft. */
    fun submit(version: Int, approverId: Long): Boolean =
        jdbc.sql("update triage_config set status = 'pending', assignee_id = ? where version = ? and status = 'draft'")
            .params(approverId, version).update() > 0

    /** Sends the pending [version] back to `draft` with no assignee; false when [version] is not pending. */
    fun reject(version: Int): Boolean =
        jdbc.sql("update triage_config set status = 'draft', assignee_id = null where version = ? and status = 'pending'")
            .param(version).update() > 0

    /**
     * Activates the pending [version] on behalf of [approver] and retires the version that was active.
     *
     * @return false when [version] is not pending
     */
    @Transactional
    fun approve(version: Int, approver: String): Boolean {
        // WARN: retire before activating; the partial unique index on `status = 'active'` rejects the reverse order.
        jdbc.sql("update triage_config set status = 'retired' where status = 'active' and version <> ?").param(version).update()
        return jdbc.sql(
            """
            update triage_config set status = 'active', assignee_id = null, approver = ?, approved_at = now()
            where version = ? and status = 'pending'
            """,
        ).params(approver, version).update() > 0
    }

    /**
     * Deletes the draft [version] with every child row; false when [version] is not a draft. A draft never decided an
     * alert, so nothing refers to it.
     */
    @Transactional
    fun deleteDraft(version: Int): Boolean {
        val id = jdbc.sql("select id from triage_config where version = ? and status = 'draft' for update").param(version)
            .query(Long::class.java).optional().orElse(null) ?: return false
        CHILD_TABLES.forEach { (table, _) -> jdbc.sql("delete from $table where config_id = ?").param(id).update() }
        return jdbc.sql("delete from triage_config where id = ? and status = 'draft'").param(id).update() > 0
    }

    /**
     * Writes one rule's policy on the draft [configId], adding the row when that draft does not score the key yet.
     *
     * Only ever legal against a draft — one just created with [copyAsDraft], or one still being written. A version
     * that has left `draft` is never edited, so this is part of writing a new version, not a change to a decided one.
     */
    @Transactional
    fun upsertRule(configId: Long, ruleKey: String, triage: RuleTriage) {
        jdbc.sql(
            """
            insert into triage_rule (config_id, rule_key, base_score, auto_closeable, implies_pep) values (?, ?, ?, ?, ?)
            on conflict (config_id, rule_key) do update
                set base_score = excluded.base_score,
                    auto_closeable = excluded.auto_closeable,
                    implies_pep = excluded.implies_pep
            """,
        ).params(configId, ruleKey, triage.baseScore, triage.autoCloseable, triage.impliesPep).update()
    }

    /**
     * Writes the rule-agnostic numbers [patch] names on the draft [configId]; a `null` leaves the column as the copy
     * carried it. Like [upsertRule], only legal against a freshly copied draft.
     *
     * Every placeholder is cast, because `coalesce(?, column)` on its own gives Postgres no type to infer from.
     */
    @Transactional
    fun updateFactors(configId: Long, patch: FactorsPatch) {
        jdbc.sql(
            """
            update triage_config set
                unknown_rule_score           = coalesce(cast(? as int), unknown_rule_score),
                per_extra_rule               = coalesce(cast(? as int), per_extra_rule),
                extra_rule_max               = coalesce(cast(? as int), extra_rule_max),
                factor_pep                   = coalesce(cast(? as int), factor_pep),
                factor_high_risk_country     = coalesce(cast(? as int), factor_high_risk_country),
                factor_static_cap            = coalesce(cast(? as int), factor_static_cap),
                factor_unbaselined_client    = coalesce(cast(? as int), factor_unbaselined_client),
                factor_tenure_under_90_days  = coalesce(cast(? as int), factor_tenure_under_90_days),
                factor_tenure_under_365_days = coalesce(cast(? as int), factor_tenure_under_365_days),
                factor_per_extra_alert_type  = coalesce(cast(? as int), factor_per_extra_alert_type),
                factor_extra_alert_type_max  = coalesce(cast(? as int), factor_extra_alert_type_max)
            where id = ?
            """,
        ).params(
            listOf(
                patch.unknownRuleScore, patch.perExtraRule, patch.extraRuleMax, patch.pep, patch.highRiskCountry,
                patch.staticCap, patch.unbaselinedClient, patch.tenureUnder90Days, patch.tenureUnder365Days,
                patch.perExtraAlertType, patch.extraAlertTypeMax, configId,
            ),
        ).update()
    }

    private fun insertChildren(id: Long, c: TriageConfig) {
        c.ruleTriage.forEach { (key, triage) ->
            jdbc.sql("insert into triage_rule (config_id, rule_key, base_score, auto_closeable, implies_pep) values (?, ?, ?, ?, ?)")
                .params(id, key, triage.baseScore, triage.autoCloseable, triage.impliesPep).update()
        }
        c.factors.riskPoints.forEach { (rating, points) ->
            jdbc.sql("insert into triage_risk_point (config_id, rating, points) values (?, ?, ?)").params(id, rating, points).update()
        }
        c.factors.channelPoints.forEach { (channel, points) ->
            jdbc.sql("insert into triage_channel_point (config_id, channel, points) values (?, ?, ?)").params(id, channel, points).update()
        }
        c.amountBands.forEachIndexed { index, band ->
            jdbc.sql("insert into triage_amount_band (config_id, position, from_amount, points) values (?, ?, ?, ?)")
                .params(id, index + 1, band.from, band.points).update()
        }
        c.intensityBands.forEach { (alertType, bands) ->
            bands.forEachIndexed { index, band ->
                jdbc.sql("insert into triage_intensity_band (config_id, alert_type, position, from_hits, points) values (?, ?, ?, ?, ?)")
                    .params(id, alertType, index + 1, band.fromHits, band.points).update()
            }
        }
        c.bands.forEachIndexed { index, band ->
            jdbc.sql("insert into triage_band (config_id, position, max_score, disposition) values (?, ?, ?, ?)")
                .params(id, index + 1, band.maxScore, band.disposition.name).update()
        }
        c.requiredFields.forEachIndexed { index, field ->
            jdbc.sql("insert into triage_required_field (config_id, position, field) values (?, ?, ?)")
                .params(id, index + 1, field.key).update()
        }
        c.floors.forEachIndexed { index, floor ->
            jdbc.sql("insert into triage_floor (config_id, position, condition, alert_type, min_disposition) values (?, ?, ?, ?, ?)")
                .params(listOf(id, index + 1, floor.condition.name, floor.alertType, floor.minDisposition.name)).update()
        }
    }

    private fun load(where: String, vararg args: Any): List<TriageConfigVersion> {
        val rules = children(
            "select t.config_id, t.rule_key, t.base_score, t.auto_closeable, t.implies_pep from triage_rule t" +
                " join triage_config c on c.id = t.config_id where $where order by t.config_id, t.rule_key",
            args,
        ) { rs ->
            rs.getString("rule_key") to RuleTriage(
                baseScore = rs.getInt("base_score"),
                autoCloseable = rs.getBoolean("auto_closeable"),
                impliesPep = rs.getBoolean("implies_pep"),
            )
        }

        // Rating and channel keys are lowercased on read, so a lookup by the literal the client table stores hits.
        val riskPoints = children(
            "select t.config_id, t.rating, t.points from triage_risk_point t join triage_config c on c.id = t.config_id" +
                " where $where order by t.config_id, t.rating",
            args,
        ) { rs -> rs.getString("rating").lowercase() to rs.getInt("points") }

        val channelPoints = children(
            "select t.config_id, t.channel, t.points from triage_channel_point t join triage_config c on c.id = t.config_id" +
                " where $where order by t.config_id, t.channel",
            args,
        ) { rs -> rs.getString("channel").lowercase() to rs.getInt("points") }

        val amountBands = children(
            "select t.config_id, t.from_amount, t.points from triage_amount_band t join triage_config c on c.id = t.config_id" +
                " where $where order by t.config_id, t.position",
            args,
        ) { rs -> AmountBand(rs.getDouble("from_amount"), rs.getInt("points")) }

        val intensityBands = children(
            "select t.config_id, t.alert_type, t.from_hits, t.points from triage_intensity_band t" +
                " join triage_config c on c.id = t.config_id where $where order by t.config_id, t.alert_type, t.position",
            args,
        ) { rs -> rs.getString("alert_type") to IntensityBand(rs.getInt("from_hits"), rs.getInt("points")) }

        val bands = children(
            "select t.config_id, t.max_score, t.disposition from triage_band t join triage_config c on c.id = t.config_id" +
                " where $where order by t.config_id, t.position",
            args,
        ) { rs -> Band(rs.getInt("max_score"), enumValueOf<Disposition>(rs.getString("disposition"))) }

        val requiredFields = children(
            "select t.config_id, t.field from triage_required_field t join triage_config c on c.id = t.config_id" +
                " where $where order by t.config_id, t.position",
            args,
        ) { rs -> RequiredField.of(rs.getString("field")) }

        val floors = children(
            "select t.config_id, t.condition, t.alert_type, t.min_disposition from triage_floor t" +
                " join triage_config c on c.id = t.config_id where $where order by t.config_id, t.position",
            args,
        ) { rs ->
            Floor(
                condition = enumValueOf<FloorCondition>(rs.getString("condition")),
                alertType = rs.getString("alert_type"),
                minDisposition = enumValueOf<Disposition>(rs.getString("min_disposition")),
            )
        }

        return jdbc.sql(
            """
            select c.id, c.version, c.status, c.author, c.created_at, c.approver, c.approved_at,
                   u.name as assignee, $CONFIG_VALUE_COLUMNS
            from triage_config c left join app_user u on u.id = c.assignee_id
            where $where order by c.version desc
            """,
        ).params(*args).query { rs, _ ->
            val id = rs.getLong("id")
            val version = rs.getInt("version")
            TriageConfigVersion(
                id = id,
                version = version,
                config = TriageConfig(
                    configVersion = configVersion(version),
                    ruleTriage = rules[id].orEmpty().toMap(),
                    unknownRuleScore = rs.getInt("unknown_rule_score"),
                    perExtraRule = rs.getInt("per_extra_rule"),
                    extraRuleMax = rs.getInt("extra_rule_max"),
                    factors = Factors(
                        riskPoints = riskPoints[id].orEmpty().toMap(),
                        pep = rs.getInt("factor_pep"),
                        highRiskCountry = rs.getInt("factor_high_risk_country"),
                        staticCap = rs.getInt("factor_static_cap"),
                        channelPoints = channelPoints[id].orEmpty().toMap(),
                        unbaselinedClient = rs.getInt("factor_unbaselined_client"),
                        tenureUnder90Days = rs.getInt("factor_tenure_under_90_days"),
                        tenureUnder365Days = rs.getInt("factor_tenure_under_365_days"),
                        perExtraAlertType = rs.getInt("factor_per_extra_alert_type"),
                        extraAlertTypeMax = rs.getInt("factor_extra_alert_type_max"),
                    ),
                    amountBands = amountBands[id].orEmpty(),
                    intensityBands = intensityBands[id].orEmpty().groupBy({ it.first }, { it.second }),
                    bands = bands[id].orEmpty(),
                    requiredFields = requiredFields[id].orEmpty(),
                    floors = floors[id].orEmpty(),
                    // Not policy stored here: `TriageService` overlays the list from `reference_list` at decision time.
                    highRiskCountries = emptySet(),
                ),
                status = rs.getString("status"),
                author = rs.getString("author"),
                createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                assignee = rs.getString("assignee"),
                approver = rs.getString("approver"),
                approvedAt = rs.getObject("approved_at", OffsetDateTime::class.java),
            )
        }.list()
    }

    /** Runs one child query and groups its rows by `config_id`, keeping the order the query returned them in. */
    private fun <T> children(sql: String, args: Array<out Any>, map: (ResultSet) -> T): Map<Long, List<T>> =
        jdbc.sql(sql).params(*args).query { rs, _ -> rs.getLong("config_id") to map(rs) }.list()
            .groupBy({ it.first }, { it.second })

    companion object {
        /** The version string a decision records. Version 1 reads `triage-v1`, which is what `alert_triage` already stores. */
        fun configVersion(version: Int) = "triage-v$version"

        /** The policy columns of `triage_config`, in the order both inserts write them. `version` comes first. */
        private const val CONFIG_COLUMNS =
            "version, unknown_rule_score, per_extra_rule, extra_rule_max, factor_pep, factor_high_risk_country, " +
                "factor_static_cap, factor_unbaselined_client, factor_tenure_under_90_days, " +
                "factor_tenure_under_365_days, factor_per_extra_alert_type, factor_extra_alert_type_max"

        /** The same columns, aliased, for the read. */
        private const val CONFIG_VALUE_COLUMNS =
            "c.unknown_rule_score, c.per_extra_rule, c.extra_rule_max, c.factor_pep, c.factor_high_risk_country, " +
                "c.factor_static_cap, c.factor_unbaselined_client, c.factor_tenure_under_90_days, " +
                "c.factor_tenure_under_365_days, c.factor_per_extra_alert_type, c.factor_extra_alert_type_max"

        /** Every child table and the columns `copyAsDraft` carries over, `config_id` aside. */
        private val CHILD_TABLES = listOf(
            "triage_rule" to "rule_key, base_score, auto_closeable, implies_pep",
            "triage_risk_point" to "rating, points",
            "triage_channel_point" to "channel, points",
            "triage_amount_band" to "position, from_amount, points",
            "triage_intensity_band" to "alert_type, position, from_hits, points",
            "triage_band" to "position, max_score, disposition",
            "triage_required_field" to "position, field",
            "triage_floor" to "position, condition, alert_type, min_disposition",
        )
    }
}
