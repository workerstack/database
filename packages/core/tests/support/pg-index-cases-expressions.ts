/**
 * More of pg-index-cases.ts's histories: an index over expressions takes each one's name as
 * FigureIndexColname figures it (a function's, a field's, a cast's type, a construct's keyword),
 * `expr` where it figures none, and numbers repeats past each other.
 */
import type { IndexCase } from "./pg-index-cases.ts"

const T = "CREATE TYPE rt AS (x int);\nCREATE TABLE t (a text, b int, j jsonb, arr int[], r rt);\n"

/** An index of `t` over `elements`, and the one name Postgres gives it */
const over = (elements: string, name: string, label: string): IndexCase => ({
	history: `${T}CREATE INDEX ON t (${elements});`,
	indexes: [`t_${name}_idx on t`],
	label: `an index over ${label}`,
})

// lookup-table: each expression with the name Postgres 17 gives its index
const EXPRESSION_CASES: readonly IndexCase[] = [
	over("lower(a)", "lower", "a function"),
	over("pg_catalog.lower(a)", "lower", "a qualified function"),
	over("upper(lower(a))", "upper", "nested functions"),
	over("(a::varchar)", "a", "a column cast"),
	over("((b + 1)::text)", "text", "a cast of an operator"),
	over("(b::int8::text)", "b", "casts of a column"),
	over("(CASE WHEN b > 0 THEN 1 END)", "case", "a CASE"),
	over("(CASE WHEN b > 0 THEN 1 ELSE b END)", "b", "a CASE whose ELSE names a column"),
	over("(COALESCE(a, 'x'))", "coalesce", "a COALESCE"),
	over("(GREATEST(b, 1))", "greatest", "a GREATEST"),
	over("(LEAST(b, 1))", "least", "a LEAST"),
	over("(NULLIF(b, 1))", "nullif", "a NULLIF"),
	over("(ROW(b)::rt)", "row", "a ROW cast to a composite"),
	over("(ARRAY[b])", "array", "an ARRAY"),
	over('(a COLLATE "C")', "a", "a collated column"),
	over("(j -> 'k')", "expr", "an operator"),
	over("(arr[1])", "arr", "a subscript"),
	over("((r).x)", "x", "a field"),
	over("(JSON_VALUE(j, '$.k'))", "json_value", "a JSON_VALUE"),
	over("(b IS NULL)", "expr", "a test"),
	over("lower(a), lower(a)", "lower_lower1", "one function twice"),
	over("a, lower(a), (a::varchar)", "a_lower_a1", "a column and expressions naming it"),
	{
		history: `CREATE EXTENSION IF NOT EXISTS btree_gist;\n${T}ALTER TABLE t ADD EXCLUDE USING gist (abs(b) WITH =);`,
		indexes: ["t_abs_excl on t constraint"],
		label: "an exclusion constraint over a function",
	},
]

export { EXPRESSION_CASES }
