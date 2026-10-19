package cz.morosystems.aml.engine.cel

/** Builds the CEL activation from bare field names; the only place that knows the qualified-name layout. */
object Activations {
    fun of(
        tx: Map<String, Any?>?,
        client: Map<String, Any?>,
        params: Map<String, Long>,
        lists: Map<String, List<String>>,
        variables: Map<String, Any?>,
    ): Map<String, Any?> = buildMap {
        tx?.forEach { (name, value) -> put("tx.$name", celValue(value)) }
        client.forEach { (name, value) -> put("client.$name", celValue(value)) }
        params.forEach { (name, value) -> put("p.$name", value) }
        lists.forEach { (name, value) -> put("lists.$name", value) }
        variables.forEach { (name, value) -> put(name, celValue(value)) }
    }

    // NOTE: CEL has no null for typed fields; an absent account or country (remittances) reads as "".
    private fun celValue(value: Any?): Any = when (value) {
        null -> ""
        is Int -> value.toLong()
        is Short -> value.toLong()
        else -> value
    }
}
