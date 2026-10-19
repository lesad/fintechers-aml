package cz.morosystems.aml.engine.run

/** Groups rule hits into alerts: one per client, or one per transaction, as the alert type's unit says. */
object AlertGrouper {
    fun group(hits: List<Hit>, units: Map<String, String>): List<AlertDraft> =
        hits.groupBy { hit ->
            when (units[hit.alertType]) {
                "transaction" -> Triple(hit.alertType, hit.clientId, hit.grainKey)
                else -> Triple(hit.alertType, hit.clientId, null)
            }
        }.map { (key, grouped) -> AlertDraft(key.first, key.second, key.third, grouped) }
}
