/**
 * What no cursor resumes after, refused by name when a cursor is minted: a computed sort, a tiebreak
 * id a JS number rounds, and a row without a sort value or its id, or with one no cursor carries.
 * UnmintableRow tells a refusal of a row's own value from one of the list's wiring.
 */
import { DatabaseError } from "../error.ts"
import { databaseErrorKeys } from "../types.ts"
import { carried, decodeId, decodeValue } from "./cursor-codec.ts"
import type { SortField } from "./types.ts"

/**
 * A 500 naming a row's value no cursor holds: a key too long for the cap, an Invalid Date or a rounded
 * number as read, a value the cursor would not read back as itself, a class its column's mode reads as
 * another. A page by cursor answers it on the page that serves the row; a page by number serves the row
 * and, when its next cursor would be minted from it, answers `nextCursor: null` with `hasMore` still
 * true. Any other mint refusal is the list's wiring or config, and every page answers it
 */
class UnmintableRow extends DatabaseError {
	constructor(cause: string) {
		super({ cause, errorKey: databaseErrorKeys.SORT_NOT_WIRED, status: "internal_server_error" })
	}
}

/** Whether `value` is an integer a JS number rounds: past ±(2^53 − 1), a lossy read of the row's key */
const lossy = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)

/**
 * Throw a 500 for a tiebreak id a JS number rounds, which cannot find its own row, so the keyset
 * would repeat or skip it, and two unique ids may read as one
 */
function refuseRoundedId(record: Record<string, unknown>, idField: string): void {
	if (!lossy(record[idField])) return
	/* the tiebreak column's read mode, which every row of the list shares, and the row's own identity: no page serves it */
	throw new DatabaseError({
		cause: `the tiebreak id ${idField} reads ${String(record[idField])}, past 2^53, where a JS number rounds it, so no cursor can find its row; read it exactly (bun:sqlite safeIntegers, libsql intMode: "bigint", drizzle's mode: "bigint" on Postgres), or on D1 key the table by a text id`,
		errorKey: databaseErrorKeys.SORT_NOT_WIRED,
		status: "internal_server_error",
	})
}

/** The cause of `cursor_pagination_unsupported` for an order no keyset can resume: a computed sort, or no tiebreak column */
const NO_KEYSET_CAUSE = "Cursor pagination needs every sort key to be a column; use page instead"

/**
 * Refuse a mint under a computed sort (`@relevance`), which no keyset can resume whatever the row
 * holds, as buildListQuery refuses a cursor under one; checked before any field, so the caller learns
 * the order cannot page by cursor, not that the row lacks a value it could never carry
 */
function refuseComputedSort(parsedSort: readonly SortField[]): void {
	if (!parsedSort.some(({ field }) => field.startsWith("@"))) return
	throw new DatabaseError({
		cause: NO_KEYSET_CAUSE,
		errorKey: databaseErrorKeys.CURSOR_PAGINATION_UNSUPPORTED,
		status: "bad_request",
	})
}

/** What a value no cursor carries is, for the 500 that names it; a sort value or an id */
function kindOf(value: unknown): string {
	if (value === null) return "null"
	if (Array.isArray(value)) return "an array"
	if (value instanceof Date) return "a time"
	if (value instanceof Uint8Array) return "bytes"
	const kind = typeof value
	if (kind === "bigint") return "an integer past 20 digits"
	if (kind === "number") return "a number that is not finite"
	return kind === "object" ? "an object" : `a ${kind}`
}

/**
 * Throw a 500 naming the field for a row a cursor cannot resume after: one without a
 * sort field or its id (a key set to undefined is one left out), or one whose value the cursor
 * would not read back as itself, a JSON object, an array or a function, which would mint a cursor
 * the next page refused as invalid
 */
function refuseUncarried(record: Record<string, unknown>, parsedSort: readonly SortField[], idField: string): void {
	const fields = [...parsedSort.map(({ field }) => field), idField]
	const missing = fields.filter((field) => record[field] === undefined)
	if (missing.length > 0) {
		throw new DatabaseError({
			cause: `the next cursor is minted from each row's ${missing.join(", ")}; select them, and the built query's extras`,
			errorKey: databaseErrorKeys.SORT_NOT_WIRED,
			status: "internal_server_error",
		})
	}
	const key = parsedSort.find(({ field }) => !carried(record[field], decodeValue))
	if (key !== undefined) {
		throw new UnmintableRow(
			`the sort by ${key.field} reads ${kindOf(record[key.field])}, which no cursor carries: sort by a column of text, numbers, booleans, times or bytes`,
		)
	}
	if (carried(record[idField], decodeId)) return
	throw new UnmintableRow(
		`the tiebreak id ${idField} reads ${kindOf(record[idField])}, which no cursor carries: key the table by text or an integer`,
	)
}

export { lossy, NO_KEYSET_CAUSE, refuseComputedSort, refuseRoundedId, refuseUncarried, UnmintableRow }
