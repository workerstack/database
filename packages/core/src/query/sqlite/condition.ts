/**
 * One filter condition as SQL on one column: the single lowering filterToSQL (drizzle's columns)
 * and buildFilterSQL (a table alias's columns by name) share, so no operator or value conversion
 * exists in one and not the other. A column is described by what it stores (its kind)
 * and the SQL its values compare against.
 */
import {
	Column,
	eq,
	gt,
	gte,
	inArray,
	is,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	notInArray,
	SQL,
	type SQLWrapper,
	sql,
} from "drizzle-orm"
import type { SQLiteColumn } from "drizzle-orm/sqlite-core"
import { IsoInstant } from "../iso-date.ts"
import type { ListDialect } from "../list-dialect.ts"
import type { FilterCondition } from "../types.ts"
import { patternOn } from "./pattern.ts"
import { pgCompared, pgContainsSQL, pgInstant } from "./pg-values.ts"

/**
 * What a column stores, which decides how a validated value binds: text; a number (`numeric`, text
 * SQLite compares by number affinity); a date as epoch milliseconds or whole seconds; or `as-is`, a
 * value bound as validated (a boolean, JSON, or a raw column whose kind was not given)
 */
type ColumnKind = "as-is" | "date-ms" | "date-s" | "number" | "numeric" | "text"

/** Every ColumnKind, for a boundary that takes one from JavaScript */
const COLUMN_KINDS: readonly ColumnKind[] = ["text", "number", "numeric", "date-ms", "date-s", "as-is"]

/** A column a condition lowers onto: what it stores, the SQL a value compares against, and its database */
type FilterColumn = {
	dialect: ListDialect
	kind: ColumnKind
	/** a drizzle column binds a value through its own mapper; any other SQL binds it as it is */
	sql: SQLWrapper
}

/** The database a drizzle column is of */
const dialectOf = (column: Column): ListDialect => (column.columnType.startsWith("Pg") ? "postgres" : "sqlite")

/**
 * A drizzle column as a FilterColumn. A date column compares as the bare column on SQLite, so its
 * value binds as the number it stores, not through drizzle's Date mapper; a Postgres one binds its
 * instant's text to the microsecond (pgInstant)
 */
function columnOf(column: SQLiteColumn): FilterColumn {
	const { dataType } = column
	const dialect = dialectOf(column)
	if (dataType === "object date") {
		if (dialect === "postgres") return { dialect, kind: "date-ms", sql: column }
		const seconds = (column as { mode?: unknown }).mode === "timestamp"
		return { dialect, kind: seconds ? "date-s" : "date-ms", sql: sql`${column}` }
	}
	if (dataType === "string numeric") return { dialect, kind: "numeric", sql: column }
	if (dataType.startsWith("string")) return { dialect, kind: "text", sql: column }
	if (dataType.startsWith("number")) return { dialect, kind: "number", sql: column }
	return { dialect, kind: "as-is", sql: column }
}

const isDate = (kind: ColumnKind): boolean => kind === "date-ms" || kind === "date-s"

/**
 * One value as `kind` stores it: an ISO date field's instant
 * by its milliseconds on a date or number column, by its text on any other; a Date by its
 * milliseconds on a date column; any other value as validated. On a seconds column, an instant past
 * its millisecond is half a millisecond past it, which secondsBound compares exactly, as it lies
 * between that millisecond and the next
 */
function stored(value: unknown, kind: ColumnKind): unknown {
	if (value instanceof IsoInstant) {
		if (kind === "date-s" && value.cut) return value.ms + 0.5
		return isDate(kind) || kind === "number" ? value.ms : value.text
	}
	return value instanceof Date && isDate(kind) ? value.getTime() : value
}

/**
 * Whether `value` is an instant between two values `column` holds, which no stored value equals: past
 * the microsecond on a Postgres date column, past the millisecond on any other. A seconds column
 * compares such an instant itself (stored)
 */
function between(value: unknown, { dialect, kind }: FilterColumn): boolean {
	if (!(value instanceof IsoInstant)) return false
	if (dialect === "postgres" && isDate(kind)) return /[1-9]/.test(value.fraction.slice(6))
	return kind !== "date-s" && value.cut
}

/** Whether `value` is of `type`, or a list holding one */
const holds = (value: unknown, type: "number" | "string"): boolean =>
	typeof value === type || (Array.isArray(value) && value.some((member) => typeof member === type))

/**
 * Whether the value is one the column cannot compare: a number on a text column, which SQLite would
 * compare as text, or text on a date or number column, which it would compare as greater than every
 * number. `numeric` compares both by its affinity. `is` and the patterns take text on
 * any column; `contains` reads a JSON array whatever the column is declared as.
 */
function mismatched(kind: ColumnKind, { operator, value }: FilterCondition): boolean {
	if (operator === "contains") return false
	if (kind === "text") return holds(value, "number")
	return (isDate(kind) || kind === "number") && !["ilike", "is", "like"].includes(operator) && holds(value, "string")
}

/**
 * The whole seconds of `members`, epoch milliseconds: what each matches on a seconds column, as
 * secondsBound rounds eq's value; one between two seconds matches no row, and is left out
 */
const wholeSeconds = (members: readonly unknown[]): number[] =>
	members.flatMap((ms) => (typeof ms === "number" && ms % 1000 === 0 ? [ms / 1000] : []))

/** The operators a date field takes with one number, which a seconds column rounds */
type SecondsOperator = "eq" | "gt" | "gte" | "lt" | "lte" | "ne" | "neq"
const isSecondsOperator = (operator: string): operator is SecondsOperator =>
	["eq", "gt", "gte", "lt", "lte", "ne", "neq"].includes(operator)

/**
 * How a seconds column compares with epoch milliseconds `ms` under `operator`: the comparison on
 * the whole second that keeps it exact (gt and lte on the second at or below, gte and lt on the one
 * at or above), or, for eq and ne on a value between two seconds, no row ("none") or every row that
 * has a value ("present")
 */
function secondsBound(
	operator: SecondsOperator,
	ms: number,
): "none" | "present" | { operator: "eq" | "gt" | "gte" | "lt" | "lte" | "ne"; seconds: number } {
	const below = Math.floor(ms / 1000)
	const above = Math.ceil(ms / 1000)
	const whole = ms % 1000 === 0
	if (operator === "gt" || operator === "lte") return { operator, seconds: below }
	if (operator === "gte" || operator === "lt") return { operator, seconds: above }
	if (operator === "eq") return whole ? { operator, seconds: below } : "none"
	return whole ? { operator: "ne", seconds: below } : "present"
}

/**
 * A seconds column's condition on epoch milliseconds: one bound rounded as secondsBound keeps it
 * exact, or an in/nin list of each member as eq (in) or ne (nin) takes it. Undefined for an
 * operator or value no rounding applies to
 */
function secondsSQL(column: SQLWrapper, operator: string, value: unknown): SQL | undefined {
	if ((operator === "in" || operator === "nin") && Array.isArray(value)) {
		const seconds = wholeSeconds(value)
		if (operator === "in") return seconds.length === 0 ? sql`0` : inArray(column, seconds)
		/* an empty list matches every row, as everywhere else; a list of no whole second matches every
		   value, but not NULL, as NOT IN reads it */
		if (value.length === 0) return sql`1`
		return seconds.length === 0 ? isNotNull(column) : notInArray(column, seconds)
	}
	if (!isSecondsOperator(operator) || typeof value !== "number") return undefined
	const bound = secondsBound(operator, value)
	if (bound === "none") return sql`0`
	if (bound === "present") return isNotNull(column)
	return { eq, gt, gte, lt, lte, ne }[bound.operator](column, bound.seconds)
}

/** `is`: null and notnull on any column, true and false on a boolean one (as validateFilter types them) */
function isToSQL(column: SQLWrapper, value: unknown): SQL | null {
	if (value === null) return isNull(column)
	if (value === "notnull") return isNotNull(column)
	return typeof value === "boolean" ? eq(column, value) : null
}

/** No row, as each dialect writes false */
const none = (dialect: ListDialect): SQL => (dialect === "postgres" ? sql`false` : sql`0`)

/**
 * The operator and value a condition compares by once each instant `between` two stored values is
 * placed: eq and contains match no row and ne every one with a value; lt and lte match up to the stored value
 * below it, gt and gte past it; an in member matches nothing and a nin member excludes nothing. An
 * SQL where that decides the condition outright
 */
function placed(
	column: FilterColumn,
	{ operator, value: given }: FilterCondition,
	value: unknown,
): SQL | { operator: string; value: unknown } {
	if (Array.isArray(given) && (operator === "in" || operator === "nin")) {
		const kept = (value as unknown[]).filter((_, i) => !between(given[i], column))
		if (kept.length > 0 || given.length === 0) return { operator, value: kept }
		return operator === "in" ? none(column.dialect) : isNotNull(column.sql)
	}
	if (!between(given, column)) return { operator, value }
	if (operator === "eq" || operator === "contains") return none(column.dialect)
	if (operator === "ne" || operator === "neq") return isNotNull(column.sql)
	if (operator === "lt" || operator === "lte") return { operator: "lte", value }
	/* gt and gte, the date operators left that take an instant */
	return { operator: "gt", value }
}

/* a member of a JSON array the column holds, whatever it is declared as; a scalar JSON value is no set, though json_each reads it as one, and text that is no JSON, which json_type raises on, is matched by nothing: a CASE asks json_valid first, in the order SQLite evaluates it */
const sqliteContainsSQL = (column: SQLWrapper, value: unknown): SQL =>
	sql`(CASE WHEN json_valid(${column}) THEN json_type(${column}) = 'array' AND EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${value}) END)`

// lookup-table: each operator on a column, with a value as the column stores it
const OPERATORS: Readonly<Record<string, (column: FilterColumn, value: unknown) => SQL | null>> = {
	contains: (column, value) =>
		column.dialect === "postgres" ? (pgContainsSQL(column.sql, value) ?? null) : sqliteContainsSQL(column.sql, value),
	eq: (column, value) => eq(column.sql, value),
	gt: (column, value) => gt(column.sql, value),
	gte: (column, value) => gte(column.sql, value),
	ilike: (column, value) => patternOn(column, "ilike", value),
	/* an empty in-list matches nothing and an empty nin-list everything, as drizzle writes them */
	in: (column, value) => inArray(column.sql, value as unknown[]),
	is: (column, value) => isToSQL(column.sql, value),
	like: (column, value) => patternOn(column, "like", value),
	lt: (column, value) => lt(column.sql, value),
	lte: (column, value) => lte(column.sql, value),
	ne: (column, value) => ne(column.sql, value),
	neq: (column, value) => ne(column.sql, value),
	nin: (column, value) => notInArray(column.sql, value as unknown[]),
}

/** One condition on one column; null when the operator or value is not one this column can take */
function lowerOn(column: FilterColumn, condition: FilterCondition): SQL | null {
	const { dialect, kind } = column
	const given = condition.value
	const value = Array.isArray(given) ? given.map((member) => stored(member, kind)) : stored(given, kind)
	if (mismatched(kind, { ...condition, value })) return null
	const pgDate = dialect === "postgres" && isDate(kind)
	const bound = pgDate ? (Array.isArray(given) ? given.map(pgInstant) : pgInstant(given)) : value
	const at = placed(column, condition, bound)
	if (is(at, SQL)) return at
	const { operator } = at
	const compared = dialect === "postgres" ? pgCompared(kind, at) : at.value
	const seconds = kind === "date-s" ? secondsSQL(column.sql, operator, at.value) : undefined
	return seconds ?? (Object.hasOwn(OPERATORS, operator) ? OPERATORS[operator]?.(column, compared) : undefined) ?? null
}

/** One condition on one drizzle column; null when the operator or value is not one this column can take */
const conditionToSQL = (condition: FilterCondition, column: SQLiteColumn): SQL | null =>
	lowerOn(columnOf(column), condition)

export { COLUMN_KINDS, type ColumnKind, conditionToSQL, dialectOf, type FilterColumn, lowerOn }
