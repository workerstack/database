/**
 * What `database migrate check` answers on a local D1 for a file that leaves a view or a trigger unable to run, through
 * the real wrangler --local. SQLite's DROP TABLE and DROP VIEW check no view or trigger that names what they drop, and
 * D1 resolves those names only when a statement runs, so such a file applies cleanly and then fails every read of the
 * view, or every write the trigger fires on (SD1 of r23). A view written through INSTEAD OF triggers for some events
 * only is a schema D1 runs, and check passes it (SD2 of r23).
 */
import fs from "node:fs"
import { afterAll, describe, expect, it } from "vitest"
import { runCli } from "../../../src/cli/index.ts"
import { d1Io, d1Project, writeMigrations } from "../support/d1-project.ts"

const dirs: string[] = []
afterAll(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

/** check's exit code and lines for `next` pending on a local D1 `base` made */
async function checked(base: string, next: string): Promise<{ code: number; lines: string }> {
	const dir = d1Project({ "0001_base.sql": base })
	dirs.push(dir)
	const apply = d1Io(dir)
	expect(await runCli(["migrate", "apply", "core", "--local"], apply), apply.errors.join("\n")).toBe(0)
	writeMigrations(dir, { "0002_next.sql": next })
	const io = d1Io(dir)
	const code = await runCli(["migrate", "check", "core", "--local", "--yes"], io)
	return { code, lines: [...io.outputs, ...io.errors].join("\n") }
}

const T = "CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT);\n"
const VIEW = `${T}CREATE VIEW v AS SELECT id, a FROM t;\nINSERT INTO t (a) VALUES ('s');\n`
const ON_V = {
	delete: "CREATE TRIGGER v_del INSTEAD OF DELETE ON v BEGIN DELETE FROM t WHERE id = old.id; END;\n",
	insert: "CREATE TRIGGER v_ins INSTEAD OF INSERT ON v BEGIN INSERT INTO t (a) VALUES (new.a); END;\n",
	update: "CREATE TRIGGER v_upd INSTEAD OF UPDATE ON v BEGIN UPDATE t SET a = new.a WHERE id = old.id; END;\n",
}
const APPROVED = "-- database:allow-unsafe: the schema's own change\n"

/* SD1 of r23 */
describe("database migrate check on D1 --local refuses a file that leaves a view or trigger unable to run", () => {
	it.each([
		{
			base: `${T}CREATE TABLE log (id INTEGER PRIMARY KEY, a TEXT);\nCREATE TRIGGER t_ai AFTER INSERT ON t BEGIN INSERT INTO log (a) VALUES (new.a); END;\n`,
			label: "a table an unchanged trigger writes",
			next: `${APPROVED}DROP TABLE log;\n`,
			refused:
				"after this file, every INSERT on t fails, as a trigger it fires cannot compile: no such table: main.log",
		},
		{
			base: `${T}CREATE VIEW v1 AS SELECT id, a FROM t;\nCREATE VIEW v2 AS SELECT a FROM v1;\n`,
			label: "a view an unchanged view reads",
			next: "DROP VIEW v1;\n",
			refused: "after this file, view v2 cannot be read: no such table: main.v1",
		},
		{
			base: `${T}CREATE TABLE u (id INTEGER PRIMARY KEY, b TEXT);\nCREATE VIEW v AS SELECT t.a, u.b FROM t JOIN u ON u.id = t.id;\n`,
			label: "a table an unchanged view reads",
			next: `${APPROVED}DROP TABLE u;\n`,
			refused: "after this file, view v cannot be read: no such table: main.u",
		},
		{
			base: `${VIEW}CREATE TABLE log (id INTEGER PRIMARY KEY, a TEXT);\n${ON_V.insert.replace("INSERT INTO t (a)", "INSERT INTO log (a)")}`,
			label: "a table an unchanged INSTEAD OF trigger writes",
			next: `${APPROVED}DROP TABLE log;\n`,
			refused:
				"after this file, every INSERT on v fails, as a trigger it fires cannot compile: no such table: main.log",
		},
	])(
		"drops $label, approved, and names the reader and SQLite's error",
		async ({ base, next, refused }) => {
			const { code, lines } = await checked(base, next)
			expect(code, lines).toBe(1)
			expect(lines).toContain(`0002_next.sql: ${refused}`)
		},
		120_000,
	)

	it("passes a drop of a table only a trigger dropped in the same file wrote", async () => {
		const base = `${T}CREATE TABLE log (id INTEGER PRIMARY KEY, a TEXT);\nCREATE TRIGGER t_ai AFTER INSERT ON t BEGIN INSERT INTO log (a) VALUES (new.a); END;\n`
		const { code, lines } = await checked(base, `${APPROVED}DROP TRIGGER t_ai;\nDROP TABLE log;\n`)
		expect(code, lines).toBe(0)
	}, 120_000)
})

/* SD2 of r23 */
describe("database migrate check on D1 --local passes a view written through INSTEAD OF triggers for some events", () => {
	it.each([
		{ label: "INSERT only", next: ON_V.insert },
		{ label: "UPDATE only", next: ON_V.update },
		{ label: "DELETE only", next: ON_V.delete },
		{ label: "INSERT and UPDATE", next: `${ON_V.insert}${ON_V.update}` },
		{ label: "all three", next: `${ON_V.insert}${ON_V.update}${ON_V.delete}` },
	])(
		"$label",
		async ({ next }) => {
			const { code, lines } = await checked(VIEW, `${APPROVED}${next}`)
			expect(code, lines).toBe(0)
		},
		120_000,
	)

	it("refuses an INSTEAD OF trigger whose body calls a function D1 does not run", async () => {
		const next = `${APPROVED}CREATE TRIGGER v_ins INSTEAD OF INSERT ON v BEGIN INSERT INTO t (a) VALUES (power(2, 2)); END;\n`
		const { code, lines } = await checked(VIEW, next)
		expect(code, lines).toBe(1)
		expect(lines).toMatch(/0002_next\.sql: D1 applies this file, then refuses INSERT INTO "v" DEFAULT VALUES: .*power/)
	}, 120_000)
})
