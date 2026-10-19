package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.Activations
import cz.morosystems.aml.engine.cel.RuleCompiler
import org.springframework.stereotype.Component

class ConfigurationException(message: String) : RuntimeException(message)

class ResolvedRuleSet(val clientsByRule: Map<RuleDefinition, Set<String>>)

/** Decides which active rules run for which client (design: "Layer resolution"); parameters come with each rule version (ADR-0034). */
@Component
class RuleResolver(private val compiler: RuleCompiler) {
    fun resolve(
        rules: List<RuleDefinition>,
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
        checkOverlappingReplacements(rules, segmentsByClient)

        val clientsByRule = rules.associateWith { rule ->
            segmentsByClient.filter { (clientId, segmentIds) ->
                rule.appliesTo(clientId, segmentIds) &&
                    rules.none { other ->
                        other.replacesKey == rule.key && other.layer > rule.layer && other.appliesTo(clientId, segmentIds)
                    }
            }.keys
        }
        return ResolvedRuleSet(clientsByRule)
    }

    private fun checkOverlappingReplacements(rules: List<RuleDefinition>, segmentsByClient: Map<String, Set<Long>>) {
        val replacing = rules.filter { it.replacesKey != null }
        segmentsByClient.forEach { (clientId, segmentIds) ->
            replacing.filter { it.appliesTo(clientId, segmentIds) }
                .groupBy { it.layer to it.replacesKey }
                .filterValues { it.size > 1 }
                .forEach { (key, overlapping) ->
                    val names = overlapping.map { it.key }.sorted().joinToString(", ")
                    throw ConfigurationException("client $clientId: rules $names both replace ${key.second}")
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
