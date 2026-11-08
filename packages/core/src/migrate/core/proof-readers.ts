/**
 * What a file leaves unable to run: SQLite's DROP TABLE and DROP VIEW check no view or trigger that names what they
 * drop, and SQLite, D1 and libsql resolve those names only when a statement runs. So a file can apply and leave every
 * read of a view, or every write a trigger fires on, failing. After a file applies to the proof's copy, each view and
 * trigger that survives it and names an object the file dropped or changed is compiled: a view's read, a trigger's
 * own write on its table or view (trigger-write.mjs). SQLite resolves a name only by name, and the copy holds every
 * reader that names a table a file reaches (proof-scope.ts), so this finds every reader the file breaks.
 */
import type { LocalDb } from "../drivers/local-db.ts"
import type { LiveObject } from "./proof-copy.ts"
import { referencesOf } from "./proof-scope.ts"
import { asciiFold } from "./sql-code.ts"
import { quote, triggerEvent, writeOf } from "./trigger-write.mjs"

/** The copy's schema, each object by type and folded name */
function schemaOf(db: LocalDb): Map<string, LiveObject> {
	const rows = db.all("SELECT type, name, sql, tbl_name FROM main.sqlite_master WHERE sql IS NOT NULL")
	return new Map(
		rows.map((row) => {
			const object = {
				name: String(row["name"]),
				sql: String(row["sql"]),
				table: String(row["tbl_name"]),
				type: String(row["type"]),
			}
			return [`${object.type} ${asciiFold(object.name)}`, object]
		}),
	)
}

/** SQLite's error compiling `sql`, or undefined */
function compileError(db: LocalDb, sql: string): string | undefined {
	try {
		db.all(`EXPLAIN ${sql}`)
		return undefined
	} catch (error) {
		// reason: what SQLite refuses to compile is the finding
		return (error as Error).message
	}
}

/** Why `reader`, a view or a trigger, fails on `db`, or undefined */
function brokenRead(db: LocalDb, reader: LiveObject): string | undefined {
	if (reader.type === "view") {
		const error = compileError(db, `SELECT * FROM ${quote(reader.name)}`)
		return error === undefined ? undefined : `view ${reader.name} cannot be read: ${error}`
	}
	const event = triggerEvent(reader.sql)
	const columns = db
		.all(`PRAGMA main.table_xinfo(${quote(reader.table)})`)
		.filter((row) => row["hidden"] === 0)
		.map((row) => String(row["name"]))
	const error = compileError(db, writeOf(reader.table, event, columns))
	return error === undefined
		? undefined
		: `every ${event} on ${reader.table} fails, as a trigger it fires cannot compile: ${error}`
}

/**
 * Throws when a file that turned the copy's schema `before` into `db`'s leaves a view or trigger unable to run,
 * naming it and SQLite's error: no approval overrides, since every read or write through it would fail
 */
function refuseBrokenReaders(db: LocalDb, before: ReadonlyMap<string, LiveObject>): void {
	const after = schemaOf(db)
	const touched = new Set(
		[...before]
			.filter(([key, object]) => after.get(key)?.sql !== object.sql)
			.map(([, object]) => asciiFold(object.name)),
	)
	if (touched.size === 0) return
	for (const reader of after.values()) {
		if (reader.type !== "view" && reader.type !== "trigger") continue
		if (![...referencesOf(reader)].some((name) => touched.has(name))) continue
		const broken = brokenRead(db, reader)
		if (broken !== undefined)
			throw new Error(`after this file, ${broken}; drop or change it in this file, or keep what it uses`)
	}
}

export { refuseBrokenReaders, schemaOf }
