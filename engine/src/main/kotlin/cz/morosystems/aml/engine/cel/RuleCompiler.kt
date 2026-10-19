package cz.morosystems.aml.engine.cel

import cz.morosystems.aml.engine.rules.Grain
import cz.morosystems.aml.engine.rules.RuleDefinition
import dev.cel.common.CelValidationException
import dev.cel.common.types.CelType
import dev.cel.common.types.SimpleType
import dev.cel.compiler.CelCompilerFactory
import dev.cel.runtime.CelRuntime
import dev.cel.runtime.CelRuntimeFactory
import org.springframework.stereotype.Component

class RuleCompileException(val ruleKey: String, val part: String, message: String) :
    RuntimeException("rule $ruleKey, $part: $message")

class CompiledRule(private val program: CelRuntime.Program) {
    fun evaluate(activation: Map<String, Any?>): Boolean = program.eval(activation) as Boolean
}

typealias CompiledPredicate = CompiledRule

@Component
class RuleCompiler {
    private val runtime = CelRuntimeFactory.standardCelRuntimeBuilder().build()

    fun compile(rule: RuleDefinition, paramNames: Set<String>): CompiledRule {
        val txVars = prefixed("tx", Vocabulary.tx)
        rule.anchor?.let { check(rule.key, "anchor", it, txVars) }

        val earlier = mutableMapOf<String, CelType>()
        rule.variables.sortedBy { it.position }.forEach { variable ->
            check(rule.key, "filter:${variable.name}", variable.filter, txVars + earlier)
            earlier[variable.name] = Vocabulary.typeOf(variable.agg)
        }

        val conditionVars = prefixed("client", Vocabulary.client) +
            prefixed("lists", Vocabulary.lists) +
            paramNames.associate { "p.$it" to SimpleType.INT } +
            earlier +
            (if (rule.grain.hasTransaction()) txVars else emptyMap())
        return CompiledRule(runtime.createProgram(check(rule.key, "condition", rule.condition, conditionVars)))
    }

    fun compileClientPredicate(source: String): CompiledPredicate =
        CompiledRule(runtime.createProgram(check("segment", "predicate", source, prefixed("client", Vocabulary.client))))

    private fun check(ruleKey: String, part: String, source: String, vars: Map<String, CelType>) =
        try {
            CelCompilerFactory.standardCelCompilerBuilder()
                .apply { vars.forEach { (name, type) -> addVar(name, type) } }
                .setResultType(SimpleType.BOOL)
                .build()
                .compile(source)
                .ast
        } catch (e: CelValidationException) {
            throw RuleCompileException(ruleKey, part, e.message ?: "invalid CEL")
        }

    private fun prefixed(prefix: String, fields: Map<String, CelType>) = fields.mapKeys { "$prefix.${it.key}" }

    private fun Grain.hasTransaction() = this != Grain.CLIENT_DAY
}
