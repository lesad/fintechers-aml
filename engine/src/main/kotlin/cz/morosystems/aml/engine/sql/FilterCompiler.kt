package cz.morosystems.aml.engine.sql

import cz.morosystems.aml.engine.rules.Agg

data class SqlFragment(val sql: String, val params: List<Any?>)

/**
 * Compiles a rule variable's CEL filter into a SQL `WHERE` fragment with JDBC `?` placeholders.
 *
 * @param variables earlier rule variables the filter may reference, by name, with their aggregate
 * @remarks `tx.<field>` maps to `tx.<field>`, so the caller's query must alias the transaction table as `tx`;
 * a variable maps to a bare column of the same name, so the caller must expose it under that name.
 */
interface FilterCompiler {
    fun compile(filter: String, variables: Map<String, Agg>): SqlFragment
}
