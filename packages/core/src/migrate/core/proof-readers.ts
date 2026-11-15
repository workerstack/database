/**
 * What a file leaves unable to run: SQLite resolves the names in a view, a trigger's body and a DEFAULT only when a
 * statement runs, and its DROP TABLE and DROP VIEW check no view or trigger that names what they drop, on SQLite, D1
 * and libsql alike. So a file can apply and leave every read of a view, every write a trigger fires on, or every
 * insert that leaves a column to its default, failing. After a file applies to the proof's copy, this compiles each
 * view and trigger the file made or changed, or that names an object it dropped, made or changed: a view's read, a
 * trigger's own write on its table or view (trigger-write.mjs). It compiles an insert of defaults alone into each
 * ordinary table the file made or changed. SQLite resolves a name only by name, and the copy holds every reader that
 * names a table a file reaches (proof-scope.ts), so this finds every reader the file breaks. An object the file
 * leaves as it was is not compiled, so a history that already holds a broken one blocks no later file
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

/** Why an insert into `table` of its defaults alone fails on `db`, or undefined; an FTS5 or other virtual table, its
 * shadow tables and SQLite's own take none from a migration */
function brokenDefault(db: LocalDb, table: LiveObject): string | undefined {
	const [listed] = db.all(`PRAGMA main.table_list(${quote(table.name)})`)
	if (listed?.["type"] !== "table" || asciiFold(table.name).startsWith("sqlite_")) return undefined
	const error = compileError(db, `INSERT INTO ${quote(table.name)} DEFAULT VALUES`)
	return error === undefined
		? undefined
		: `an insert into ${table.name} that leaves a column to its default cannot compile: ${error}`
}

/** Whether the file made or changed an object, and the folded names of every object it dropped, made or changed */
type FileScope = { made: boolean; touched: ReadonlySet<string> }

/** Why `object`, which the file made or changed or which names what it touched, fails on `db`, or undefined */
function brokenObject(db: LocalDb, object: LiveObject, { made, touched }: FileScope): string | undefined {
	if (object.type === "table") return made ? brokenDefault(db, object) : undefined
	if (object.type !== "view" && object.type !== "trigger") return undefined
	if (!made && ![...referencesOf(object)].some((name) => touched.has(name))) return undefined
	return brokenRead(db, object)
}

/**
 * Throws when a file that turned the copy's schema `before` into `db`'s leaves a view, a trigger or a DEFAULT unable
 * to run, naming it and SQLite's error: no approval overrides, since every read or write through it would fail
 */
function refuseBrokenReaders(db: LocalDb, before: ReadonlyMap<string, LiveObject>): void {
	const after = schemaOf(db)
	/* each object the file dropped, made or changed, by type and folded name */
	const changed = new Set(
		[...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key)?.sql !== after.get(key)?.sql),
	)
	if (changed.size === 0) return
	const touched = new Set([...changed].map((key) => key.slice(key.indexOf(" ") + 1)))
	for (const [key, object] of after) {
		const broken = brokenObject(db, object, { made: changed.has(key), touched })
		if (broken !== undefined)
			throw new Error(`after this file, ${broken}; drop or change it in this file, or keep what it uses`)
	}
}

export { refuseBrokenReaders, schemaOf }
