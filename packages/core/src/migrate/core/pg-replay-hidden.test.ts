import { beforeAll, describe, expect, it } from "vitest"
import { loadPostgresParser } from "./pg-parser.ts"
import { type Hidden, nothingHidden, readStatement, runsHidden } from "./pg-replay-hidden.ts"
import type { Sql } from "./pg-replay-database.ts"
import { pgRead } from "./pg-split.ts"

beforeAll(loadPostgresParser)

/** What the statements of `sql`, read in turn, can run that comb cannot read */
function read(sql: string): Hidden {
	const hidden = nothingHidden()
	for (const { tree } of pgRead(sql).statements) readStatement(tree, hidden)
	return hidden
}

/** The replay's connection, faked: what it was asked, answering whether a bare name is none of pg_catalog's alone */
function replayOf(outside: boolean): { asked: unknown[][]; sql: Sql } {
	const asked: unknown[][] = []
	const sql = {
		unsafe: async (_query: string, params: unknown[]) => {
			asked.push(params)
			return [{ hidden: outside }]
		},
	}
	return { asked, sql: sql as unknown as Sql }
}

/* PR1 of r23: only a statement that can run code comb cannot read can make a change past its database that no count sees */
describe("readStatement", () => {
	it.each([
		["a DO block", "DO $$ BEGIN NULL; END $$;"],
		["a CALL", "CALL backfill();"],
		["an EXECUTE", "PREPARE p AS SELECT 1; EXECUTE p;"],
		["a CREATE TABLE AS EXECUTE", "PREPARE p AS SELECT 1; CREATE TABLE t AS EXECUTE p;"],
		["a call qualified by a schema other than pg_catalog", "SELECT app.make_side();"],
		["a call qualified by a database", "SELECT db.app.make_side();"],
		["a statement the parser cannot read", "SELECT FROM WHERE;"],
	])("holds %s as code comb cannot read", (_, sql) => {
		expect(read(sql).code).toBe(true)
	})

	it("holds a call by a bare name, nested anywhere, for the replay's database to resolve, and a pg_catalog-qualified one as none", () => {
		expect(
			read(
				"CREATE TABLE t AS SELECT pg_sleep(1), pg_catalog.lower('A') FROM generate_series(1, 2) g WHERE g IN (SELECT abs(-1));",
			),
		).toEqual({ calls: new Set(["pg_sleep", "generate_series", "abs"]), code: false, made: new Set() })
	})

	it("holds the functions a file makes, and nothing of plain statements", () => {
		expect(
			read(
				"CREATE SCHEMA s; CREATE TABLE s.t (id int); CREATE FUNCTION s.make_side() RETURNS void LANGUAGE sql AS 'SELECT 1'; CREATE TRIGGER x AFTER INSERT ON s.t EXECUTE FUNCTION s.make_side(); INSERT INTO s.t VALUES (1);",
			),
		).toEqual({ calls: new Set(), code: false, made: new Set(["make_side"]) })
	})
})

describe("runsHidden", () => {
	it("is true for code comb cannot read, asking nothing", async () => {
		const { asked, sql } = replayOf(false)
		expect(await runsHidden(sql, { ...nothingHidden(), code: true })).toBe(true)
		expect(asked).toEqual([])
	})

	it("is true for a bare call of a function the file makes, asking nothing", async () => {
		const { asked, sql } = replayOf(false)
		expect(
			await runsHidden(
				sql,
				read("CREATE FUNCTION upper(x int) RETURNS int LANGUAGE sql AS 'SELECT x'; SELECT upper(1);"),
			),
		).toBe(true)
		expect(asked).toEqual([])
	})

	it("is false for statements that call nothing, asking nothing", async () => {
		const { asked, sql } = replayOf(true)
		expect(await runsHidden(sql, read("CREATE TABLE t (id int);"))).toBe(false)
		expect(asked).toEqual([])
	})

	it.each([true, false])(
		"asks the replay's database of each bare name, and answers as it does: %s",
		async (outside) => {
			const { asked, sql } = replayOf(outside)
			expect(await runsHidden(sql, read("SELECT pg_sleep(1), make_side();"))).toBe(outside)
			expect(asked).toEqual([['["pg_sleep","make_side"]']])
		},
	)
})
