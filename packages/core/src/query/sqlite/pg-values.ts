/**
 * A filter value as a Postgres column compares it, bound by database rather than through drizzle's
 * mapper: condition.ts lowers each condition, and this reads a value the way Postgres's types do.
 */
import { Column, is, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { IsoInstant } from "../iso-date.ts"
import type { ColumnKind } from "./condition.ts"

/**
 * A date value as a Postgres date column compares it: its instant as ISO text to the microsecond,
 * the finest a Postgres timestamp holds, bound as text for Postgres to read as the column's type;
 * any other value as validated
 */
function pgInstant(value: unknown): unknown {
	if (value instanceof IsoInstant) return `${value.text.slice(0, -4)}${value.fraction.slice(0, 6)}Z`
	if (typeof value === "number") return new Date(value).toISOString()
	return value instanceof Date ? value.toISOString() : value
}

// lookup-table: the operators that compare a value, or each member of a list, as the column's type reads it
const COMPARING: ReadonlySet<string> = /* @__PURE__ */ new Set([
	"eq",
	"gt",
	"gte",
	"in",
	"lt",
	"lte",
	"ne",
	"neq",
	"nin",
])

/**
 * A value of `type` on a Postgres column, bound by `bind` rather than through drizzle's mapper, alone or
 * as each member of a list. A number binds as `numeric`: drizzle binds it as an `integer` where the column
 * is one, which refuses 1.5, and Postgres reads an integer column as numeric to compare it, and the
 * numeric as a double against a double column, so each compares exactly. A date column's instant binds
 * as its text, which drizzle's Date mapper would cut to milliseconds. Any other value as it is
 */
function bound(
	{ operator, value }: { operator: string; value: unknown },
	type: "number" | "string",
	bind: (member: unknown) => SQL,
): unknown {
	if (!COMPARING.has(operator)) return value
	const each = (member: unknown) => (typeof member === type ? bind(member) : member)
	return Array.isArray(value) ? value.map(each) : each(value)
}

/** A value, or each member of a list, as a Postgres column of `kind` compares it under `operator` */
function pgCompared(kind: ColumnKind, at: { operator: string; value: unknown }): unknown {
	if (kind === "date-ms" || kind === "date-s") return bound(at, "string", (member) => sql`${member}`)
	if (kind === "number" || kind === "numeric") return bound(at, "number", (member) => sql`${member}::numeric`)
	return at.value
}

/**
 * `contains` on a Postgres `json` or `jsonb` column: a member of the array it holds, as SQLite's
 * json_each reads one; any other column holds no JSON Postgres reads without raising, so undefined
 */
function pgContainsSQL(column: SQLWrapper, value: unknown): SQL | undefined {
	const jsonType = is(column, Column) ? column.getSQLType() : ""
	if (jsonType !== "json" && jsonType !== "jsonb") return undefined
	const member =
		typeof value === "number"
			? sql`${value}::numeric`
			: typeof value === "boolean"
				? sql`${value}::boolean`
				: sql`${value}::text`
	const json = sql`${column}::jsonb`
	return sql`(jsonb_typeof(${json}) = 'array' AND ${json} @> jsonb_build_array(${member}))`
}

export { pgCompared, pgContainsSQL, pgInstant }
