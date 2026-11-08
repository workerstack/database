/**
 * PostgREST-style filters and sort orders: parse and validate. DB-agnostic: no SQL, only
 * the AST and its checks. The grammar lives in filter-parse.ts, the checks in filter-validate.ts.
 */
import { FILTER_OPERATORS, parseFilter } from "./filter-parse.ts"
import { parseFilterNumber } from "./filter-typed.ts"
import {
	FILTER_LIMITS,
	OPERATORS_BY_TYPE,
	type FilterField,
	type FilterFieldSpec,
	type FilterLimits,
	type FilterValidationResult,
	type LimitsGiven,
	validateFilter,
} from "./filter-validate.ts"
import type { SortDirection, SortField } from "./types.ts"

/** The direction suffix an `order` entry may end in, before any nulls suffix, and what it reads as */
const SORT_DIRECTIONS = { asc: "asc", desc: "desc" } as const satisfies Record<string, SortDirection>
/** The nulls suffix an `order` entry may end in, and what it reads as */
const SORT_NULLS = { nullsfirst: "first", nullslast: "last" } as const

/** The value `suffixes` reads the last of `tokens` as, popping it, or undefined when it is none of them */
function suffixOf<T extends string>(tokens: string[], suffixes: Readonly<Record<string, T>>): T | undefined {
	for (const [suffix, value] of Object.entries(suffixes))
		if (tokens.at(-1) === suffix) {
			tokens.pop()
			return value
		}
	return undefined
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** A regular expression taking any one of `names`, each literally */
function anyOf(names: readonly string[]): string {
	return `(?:${names.map(escapeRegExp).join("|")})`
}

/**
 * A regular expression taking every `order` parseOrder reads over the fields in `sort`, up to
 * `maxSortKeys` entries: the empty value, which reads as the default order, and each entry the field
 * and the suffixes orderEntries reads off it. A field named twice is refused, so no order holds more
 * entries than `sort` has fields; which field repeats needs a lookahead, which RE2 lacks, so the
 * pattern leaves that to the description
 */
function orderPattern(sort: readonly string[], maxSortKeys: number): string {
	const entry = `${anyOf(sort)}(?:\\.${anyOf(Object.keys(SORT_DIRECTIONS))})?(?:\\.${anyOf(Object.keys(SORT_NULLS))})?`
	const keys = Math.min(maxSortKeys, sort.length)
	return `^(?:${entry}(?:,${entry}){0,${Math.max(0, keys - 1)}})?$`
}

/**
 * Parse PostgREST-style `order` string into SortField array.
 *
 * Grammar:
 *   order  := entry ("," entry)*
 *   entry  := field ("." direction)? ("." nulls)?
 *   field  := any string not containing "." at the direction/nulls boundary
 *            (dotted relation paths OK: "author.name.asc")
 *   direction := "asc" | "desc"        (default "asc" when omitted)
 *   nulls     := "nullsfirst" | "nullslast"
 *
 * Examples:
 *   "name"                         → [{ field: "name", direction: "asc" }]
 *   "name.desc"                    → [{ field: "name", direction: "desc" }]
 *   "name.asc.nullslast"           → [{ field: "name", direction: "asc", nulls: "last" }]
 *   "col1.desc,col2.asc.nullsfirst"
 *     → [{field:"col1",direction:"desc"}, {field:"col2",direction:"asc",nulls:"first"}]
 *
 * An entry that is empty, names no field (`asc`, `.desc`, a trailing comma) or has whitespace around
 * it, and a field named twice, refuse the whole order as null, as parseFilter refuses a filter, rather
 * than drop it and widen the request to the default order.
 */
function parseOrder(input: string | null | undefined): SortField[] | null {
	const entries = orderEntries(input)
	const fields = entries.filter((entry) => typeof entry !== "string")
	return fields.length === entries.length && namedTwice(fields).length === 0 ? fields : null
}

/** Each field `fields` names more than once, once each */
function namedTwice(fields: readonly SortField[]): string[] {
	const seen = new Set<string>()
	const twice = new Set<string>()
	for (const { field } of fields) (seen.has(field) ? twice : seen).add(field)
	return [...twice]
}

/**
 * Each entry of `order` read as a sort field, or kept as its text when it is empty, names no field or
 * has whitespace around it, which the published pattern refuses too
 */
function orderEntries(input: string | null | undefined): Array<SortField | string> {
	if (!input) return []

	const fields: Array<SortField | string> = []
	const parts = input.split(",")

	for (const part of parts) {
		const trimmed = part.trim()

		const tokens = trimmed.split(".")

		const nulls = suffixOf(tokens, SORT_NULLS)
		const direction: SortDirection = suffixOf(tokens, SORT_DIRECTIONS) ?? "asc"

		const field = tokens.join(".")
		if (!field || part !== trimmed) {
			fields.push(part)
			continue
		}

		const entry: SortField = { direction, field }
		if (nulls) entry.nulls = nulls
		fields.push(entry)
	}

	return fields
}

export {
	FILTER_LIMITS,
	FILTER_OPERATORS,
	OPERATORS_BY_TYPE,
	parseFilter,
	parseFilterNumber,
	namedTwice,
	orderEntries,
	orderPattern,
	parseOrder,
	validateFilter,
	type FilterField,
	type FilterFieldSpec,
	type FilterLimits,
	type FilterValidationResult,
	type LimitsGiven,
}
