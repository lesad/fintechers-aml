package cz.morosystems.aml.engine.sql

import com.spandigital.cel2sql.Cel2Sql
import com.spandigital.cel2sql.ConvertOptions
import cz.morosystems.aml.engine.cel.Vocabulary
import cz.morosystems.aml.engine.rules.Agg
import dev.cel.common.types.MapType
import dev.cel.common.types.SimpleType
import dev.cel.compiler.CelCompilerFactory
import org.springframework.stereotype.Component

@Component
class Cel2SqlFilterCompiler : FilterCompiler {
    override fun compile(filter: String, variables: Map<String, Agg>): SqlFragment {
        val ast = CelCompilerFactory.standardCelCompilerBuilder()
            // NOTE: cel2sql4j rejects qualified identifiers, so tx is a map here; RuleCompiler type-checks the filter.
            .addVar("tx", MapType.create(SimpleType.STRING, SimpleType.DYN))
            .apply { variables.forEach { (name, agg) -> addVar(name, Vocabulary.typeOf(agg)) } }
            .setResultType(SimpleType.BOOL)
            .build()
            .compile(filter)
            .ast
        val result = Cel2Sql.convertParameterized(ast, ConvertOptions.defaults())
        return SqlFragment(POSTGRES_PLACEHOLDER.replace(result.sql(), "?"), result.parameters())
    }

    private companion object {
        val POSTGRES_PLACEHOLDER = Regex("""\$\d+""")
    }
}
