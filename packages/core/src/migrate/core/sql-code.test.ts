import { describe, expect, it } from "vitest"
import { lastPart, namesIn, splitTopLevel, sqliteNames, topLevel, unquote } from "./sql-code.ts"

describe("unquote and lastPart", () => {
	it.each([
		['"public"."post"', "public.post", "post"],
		["`post`", "post", "post"],
		["[dbo].[post]", "dbo.post", "post"],
		['"say ""hi"""', 'say "hi"', 'say "hi"'],
		["public . post", "public.post", "post"],
		["post", "post", "post"],
	])("reads %s as %s, table %s", (name, joined, last) => {
		expect(unquote(name)).toBe(joined)
		expect(lastPart(name)).toBe(last)
	})
})

describe("splitTopLevel and topLevel", () => {
	it("splits only at commas outside parentheses", () => {
		expect(splitTopLevel("ADD c numeric(10,2), DROP COLUMN d , ")).toEqual(["ADD c numeric(10,2)", "DROP COLUMN d"])
	})

	it("blanks every parenthesized group", () => {
		expect(topLevel("DELETE FROM t USING (SELECT 1 WHERE (x)) s")).toBe("DELETE FROM t USING                      s")
	})
})

/* P2 of r22: the names a file spells, which a change past its database must name to be the file's */
describe("namesIn", () => {
	it("folds an unquoted name as Postgres does and keeps a quoted one exact", () => {
		expect(namesIn("CREATE ROLE Svc")).toContain("svc")
		expect(namesIn("CREATE ROLE Svc")).not.toContain("Svc")
		expect(namesIn('CREATE ROLE "Svc"')).toContain("Svc")
		expect(namesIn('CREATE ROLE "Svc"')).not.toContain("svc")
	})

	it("reads a string as its exact contents and as the SQL it may be, through every quote", () => {
		const dblink = namesIn("SELECT dblink_exec('dbname=x', 'CREATE ROLE Svc')")
		expect(dblink).toContain("svc")
		expect(dblink).toContain("CREATE ROLE Svc")
		expect(namesIn("DO $$ BEGIN EXECUTE format('CREATE ROLE %I', 'x'); END $$")).toContain("x")
		expect(namesIn('SELECT f($b$CREATE DATABASE "Big"$b$)')).toContain("Big")
		expect(namesIn("SELECT dblink_exec('', 'CREATE ROLE ''Odd''')")).toContain("Odd")
	})

	it("cuts a name to the 63 bytes Postgres keeps, at a character, and reads no comment", () => {
		expect(namesIn(`CREATE ROLE ${"a".repeat(70)}`)).toContain("a".repeat(63))
		expect(namesIn(`CREATE ROLE "${"é".repeat(40)}"`)).toContain("é".repeat(31))
		expect(namesIn("SELECT 1 -- ghost\n/* spook */")).not.toContain("ghost")
		expect(namesIn("SELECT 1 /* spook */")).not.toContain("spook")
	})
})

describe("sqliteNames: the names SQLite code spells (8.5 of plan 21)", () => {
	it("reads each bare and quoted name folded as SQLite resolves it, and each word of a string, but no comment or keyword", () => {
		const sql = `UPDATE "My""T" SET [Col] = \`B\` -- Gone\nWHERE x = 'Inside Out' /* Away */ AND Über = 1;`
		expect([...sqliteNames(sql)].toSorted()).toEqual(["b", "col", "inside", 'my"t', "out", "x", "Über"].toSorted())
	})

	/* SD3 of r23: anyrow's shard has a table named `table`, which the keyword of every CREATE TABLE spelled */
	it.each([
		[
			"the keywords of a CREATE TABLE",
			"CREATE TABLE r23_probe (id text PRIMARY KEY NOT NULL)",
			["id", "r23_probe", "text"],
		],
		["a quoted table named for a keyword", 'CREATE TABLE "table" (`key` text)', ["key", "table", "text"]],
		["a table named for a keyword in a string", "SELECT * FROM 'table'", ["table"]],
		[
			"the KEY of PRIMARY KEY and FOREIGN KEY",
			"CREATE TABLE t (a PRIMARY KEY, FOREIGN KEY (a) REFERENCES u (b))",
			["a", "b", "t", "u"],
		],
		["the KEY after a comment is still the keyword's", "CREATE TABLE t (a PRIMARY /* c */ KEY)", ["a", "t"]],
		["a table named key, which SQLite takes as a name", "SELECT * FROM key", ["key"]],
		["a table named key beside PRIMARY, since a name can follow PRIMARY (a comma between)", "PRIMARY, key", ["key"]],
		[
			"a name SQLite takes for a name though it is a keyword",
			"SELECT * FROM action, end, left",
			["action", "end", "left"],
		],
	])("%s", (_, sql, expected) => {
		expect([...sqliteNames(sql)].toSorted()).toEqual(expected.toSorted())
	})
})
