/**
 * The SQLite engine's resource codes, which a retry or a bigger plan can fix, as the libsql,
 * bun:sqlite and D1 handlers answer them.
 */
import { type ConstraintFallback, own } from "../constraint-map.ts"
import { databaseErrorKeys } from "../types.ts"

/* the engine's resource codes, which a retry or a bigger plan can fix */
const RESOURCE: Record<string, ConstraintFallback> = {
	SQLITE_BUSY: {
		cause: "Database is busy. Please retry shortly.",
		errorKey: databaseErrorKeys.DATABASE_UNAVAILABLE,
		status: "service_unavailable",
	},
	SQLITE_FULL: {
		cause: "The database storage limit has been reached.",
		errorKey: databaseErrorKeys.STORAGE_LIMIT_REACHED,
		status: "unprocessable_entity",
	},
	SQLITE_LOCKED: {
		cause: "Database is busy. Please retry shortly.",
		errorKey: databaseErrorKeys.DATABASE_UNAVAILABLE,
		status: "service_unavailable",
	},
	SQLITE_READONLY: {
		cause: "Database is read-only right now.",
		errorKey: databaseErrorKeys.DATABASE_READONLY,
		status: "service_unavailable",
	},
}

/** The outcome of an engine resource code, its extended form read as its primary; undefined for any other */
export const resourceOutcome = (code: string | undefined): ConstraintFallback | undefined =>
	own(RESOURCE, code?.replace(/^(SQLITE_[A-Z]+)_.*$/, "$1"))
