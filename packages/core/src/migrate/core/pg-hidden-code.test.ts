import { beforeAll, describe, expect, it } from "vitest"
import { runsHiddenCode } from "./pg-hidden-code.ts"
import { loadPostgresParser, postgresParser } from "./pg-parser.ts"

beforeAll(() => loadPostgresParser())

const hidden = (sql: string): boolean => runsHiddenCode(postgresParser().parseSync(sql).stmts)

describe("a statement that runs code database does not read", () => {
	it.each([
		"DO $$BEGIN PERFORM 1; END$$",
		"CALL p()",
		"EXECUTE q",
		"SELECT f()",
		"SELECT public.lower('a')",
		"INSERT INTO t SELECT g(a) FROM u",
		"ALTER TABLE t ADD COLUMN a int DEFAULT f()",
	])("reads %j as running hidden code", (sql) => {
		expect(hidden(sql)).toBe(true)
	})

	it.each([
		"SELECT 1",
		"SELECT lower('a')",
		"SELECT pg_catalog.lower('a')",
		"ALTER TABLE t VALIDATE CONSTRAINT c",
		"UPDATE t SET a = upper(b)",
	])("reads %j as running none", (sql) => {
		expect(hidden(sql)).toBe(false)
	})
})
