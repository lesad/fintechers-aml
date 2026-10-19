package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.Activations
import cz.morosystems.aml.engine.cel.RuleCompiler
import org.springframework.stereotype.Component

class ConfigurationException(message: String) : RuntimeException(message)

class ResolvedRuleSet(
    val clientsByRule: Map<RuleDefinition, Set<String>>,
    private val params: List<ParamRow>,
    private val segmentsByClient: Map<String, Set<Long>>,
) {
    /** The rule's parameters as this client sees them: client over segment over company. */
    fun params(ruleKey: String, clientId: String): Map<String, Long> {
        val segments = segmentsByClient[clientId].orEmpty()
        return params.filter { it.ruleKey == ruleKey && it.appliesTo(clientId, segments) }
            .sortedBy { it.layer.ordinal }
            .associate { it.name to it.value }
    }
}

/** Decides which active rules run for which client, and with which parameters (design: "Layer resolution"). */
@Component
class RuleResolver(private val compiler: RuleCompiler) {
    fun resolve(
        rules: List<RuleDefinition>,
        params: List<ParamRow>,
        segments: List<Segment>,
        clients: List<Map<String, Any?>>,
    ): ResolvedRuleSet {
        rules.mapNotNull { it.replacesKey }.filter { key -> rules.none { it.key == key } }.forEach {
            throw ConfigurationException("a rule replaces '$it', which is not an active rule")
        }

        val predicates = segments.associate { it.id to compiler.compileClientPredicate(it.predicate) }
        val segmentsByClient = clients.associate { client ->
            val activation = Activations.of(null, client, emptyMap(), emptyMap(), emptyMap())
            client.id() to predicates.filterValues { it.evaluate(activation) }.keys
        }
        checkSegmentParamConflicts(params, segments, segmentsByClient)

        val clientsByRule = rules.associateWith { rule ->
            segmentsByClient.filter { (clientId, segmentIds) ->
                rule.appliesTo(clientId, segmentIds) &&
                    rules.none { other ->
                        other.replacesKey == rule.key && other.layer > rule.layer && other.appliesTo(clientId, segmentIds)
                    }
            }.keys
        }
        return ResolvedRuleSet(clientsByRule, params, segmentsByClient)
    }

    private fun checkSegmentParamConflicts(params: List<ParamRow>, segments: List<Segment>, segmentsByClient: Map<String, Set<Long>>) {
        val segmentParams = params.filter { it.layer == Layer.SEGMENT }
        val names = segments.associate { it.id to it.name }
        segmentsByClient.forEach { (clientId, segmentIds) ->
            segmentParams.filter { it.scopeSegmentId in segmentIds }
                .groupBy { it.ruleKey to it.name }
                .filterValues { rows -> rows.map { it.scopeSegmentId }.distinct().size > 1 }
                .forEach { (key, rows) ->
                    val conflicting = rows.mapNotNull { names[it.scopeSegmentId] }.sorted().joinToString(", ")
                    throw ConfigurationException("client $clientId: segments $conflicting all set ${key.first}.${key.second}")
                }
        }
    }

    private fun Map<String, Any?>.id() = requireNotNull(this["id"]) { "client without id" } as String
}

private fun RuleDefinition.appliesTo(clientId: String, segmentIds: Set<Long>) = when (layer) {
    Layer.COMPANY -> true
    Layer.SEGMENT -> scopeSegmentId in segmentIds
    Layer.CLIENT -> scopeClientId == clientId
}

private fun ParamRow.appliesTo(clientId: String, segmentIds: Set<Long>) = when (layer) {
    Layer.COMPANY -> true
    Layer.SEGMENT -> scopeSegmentId in segmentIds
    Layer.CLIENT -> scopeClientId == clientId
}
