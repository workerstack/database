import { afterEach, describe, expect, it } from "vitest"
import { libsqlConnection, type LibsqlConnection } from "../__fixtures__/libsql-connection.ts"
import { type Proof, provePending } from "./proof-run.ts"

const open: LibsqlConnection[] = []
afterEach(async () => {
	for (const conn of open.splice(0)) await conn.close()
})

/** The proof of `file` on a database the live schema `live` made */
async function prove(live: string, file: string): Promise<Proof> {
	const conn = libsqlConnection()
	open.push(conn)
	await conn.client.executeMultiple(live)
	const proofs = await provePending(conn, [{ name: "2_file.sql", sql: file }])
	return proofs.get("2_file.sql") as Proof
}

const LOG = "CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT);\nCREATE TABLE log (id INTEGER PRIMARY KEY, a TEXT);\n"
const VIEW = "CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT);\nCREATE VIEW v AS SELECT id, a FROM t;\n"

/** Each file that leaves a view or trigger of the live schema unable to run, and the reader it names */
const BROKEN_READERS = [
	{
		file: "DROP TABLE log;",
		label: "drops a table an AFTER INSERT trigger writes",
		live: `${LOG}CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN INSERT INTO log (a) VALUES (new.a); END;`,
		refused: "every INSERT on t fails, as a trigger it fires cannot compile: no such table: main.log",
	},
	{
		file: "DROP TABLE log;",
		label: "drops a table an UPDATE OF trigger writes",
		live: `${LOG}CREATE TRIGGER t_au AFTER UPDATE OF a ON t BEGIN INSERT INTO log (a) VALUES (new.a); END;`,
		refused: "every UPDATE on t fails, as a trigger it fires cannot compile: no such table: main.log",
	},
	{
		file: "DROP TABLE log;",
		label: "drops a table a BEFORE DELETE trigger writes",
		live: `${LOG}CREATE TRIGGER t_bd BEFORE DELETE ON t BEGIN INSERT INTO log (a) VALUES (old.a); END;`,
		refused: "every DELETE on t fails, as a trigger it fires cannot compile: no such table: main.log",
	},
	{
		file: "DROP VIEW v;",
		label: "drops a view another view reads",
		live: `${VIEW}CREATE VIEW v2 AS SELECT a FROM v;`,
		refused: "view v2 cannot be read: no such table: main.v",
	},
	{
		file: "DROP TABLE log;",
		label: "drops a table an INSTEAD OF trigger of a view writes",
		live: `${VIEW}CREATE TABLE log (id INTEGER PRIMARY KEY, a TEXT);\nCREATE TRIGGER v_ins INSTEAD OF INSERT ON v BEGIN INSERT INTO log (a) VALUES (new.a); END;`,
		refused: "every INSERT on v fails, as a trigger it fires cannot compile: no such table: main.log",
	},
]

/* SD1 of r23: SQLite's DROP TABLE and DROP VIEW check no view or trigger naming what they drop, so a file can apply and
   leave every read of a view, or every write a trigger fires on, failing; SQLite compiles both on EXPLAIN */
describe("provePending on a file that leaves a view or trigger unable to run (SD1 of r23)", () => {
	it.each((["runtime", "libsql"] as const).flatMap((engine) => BROKEN_READERS.map((each) => ({ ...each, engine }))))(
		"$label: refused on $engine, naming the reader and SQLite's error",
		async ({ engine, file, live, refused }) => {
			const conn = libsqlConnection()
			open.push(conn)
			await conn.client.executeMultiple(live)
			await expect(provePending(conn, [{ name: "2_file.sql", sql: file }], { engine })).rejects.toThrow(
				`2_file.sql: after this file, ${refused}; drop or change it in this file, or keep what it uses`,
			)
		},
	)

	it.each([
		{
			file: "DROP TRIGGER t_ai;\nDROP TABLE log;",
			label: "a drop of what only a trigger the file dropped too used",
			live: `${LOG}CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN INSERT INTO log (a) VALUES (new.a); END;`,
		},
		{
			file: "DROP TABLE log;\nCREATE TABLE log (id INTEGER PRIMARY KEY, a TEXT, b TEXT);",
			label: "a drop of the table a trigger writes, made again in the same file",
			live: `${LOG}CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN INSERT INTO log (a) VALUES (new.a); END;`,
		},
		{
			file: "ALTER TABLE t ADD COLUMN b TEXT;",
			label: "a change to what a view and an INSTEAD OF UPDATE trigger use, which both still compile",
			live: `${VIEW}CREATE TRIGGER v_upd INSTEAD OF UPDATE ON v BEGIN UPDATE t SET a = new.a WHERE id = old.id; END;`,
		},
	])("passes $label", async ({ file, live }) => {
		const proof = await prove(live, file)
		expect(proof.failed).toBeUndefined()
	})
})
