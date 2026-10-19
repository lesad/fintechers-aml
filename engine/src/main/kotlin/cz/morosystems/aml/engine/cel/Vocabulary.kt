package cz.morosystems.aml.engine.cel

import cz.morosystems.aml.engine.rules.Agg
import dev.cel.common.types.CelType
import dev.cel.common.types.ListType
import dev.cel.common.types.SimpleType

/** The names a rule's CEL may use, declared as qualified identifiers (`tx.amount`) with concrete types. */
object Vocabulary {
    val tx: Map<String, CelType> = mapOf(
        "id" to SimpleType.STRING,
        "amount" to SimpleType.INT,
        "direction" to SimpleType.STRING,
        "payer_country" to SimpleType.STRING,
        "payee_country" to SimpleType.STRING,
        "payer_account" to SimpleType.STRING,
        "payee_account" to SimpleType.STRING,
        "type" to SimpleType.STRING,
        "currency" to SimpleType.STRING,
    )

    val client: Map<String, CelType> = mapOf(
        "id" to SimpleType.STRING,
        "country" to SimpleType.STRING,
        "pep" to SimpleType.BOOL,
        "type" to SimpleType.STRING,
        "channel" to SimpleType.STRING,
        "risk" to SimpleType.STRING,
        "expected_monthly_volume" to SimpleType.INT,
        "q2_volume" to SimpleType.INT,
        "q2_tx_count" to SimpleType.INT,
        "q2_max_tx" to SimpleType.INT,
        "q2_days" to SimpleType.INT,
    )

    val lists: Map<String, CelType> = mapOf("high_risk" to ListType.create(SimpleType.STRING))

    fun typeOf(agg: Agg): CelType = if (agg == Agg.SET) ListType.create(SimpleType.STRING) else SimpleType.INT
}
