/**
 * pg-unseen.ts on its own (PA1 and PA2 of r23): which statements run code their text does not show,
 * and what the history forgets after one. classify.pg-moves.test.ts and pg-bounds.test.ts rate what follows.
 */
import { beforeAll, describe, expect, it } from "vitest"
import { followTree } from "./pg-history.ts"
import { emptyFacts, type Facts, nodesOf } from "./pg-nodes.ts"
import { loadPostgresParser, postgresParser } from "./pg-parser.ts"
import { forgetUnseen, runsUnseen } from "./pg-unseen.ts"

beforeAll(() => loadPostgresParser())

const HISTORY = `CREATE FUNCTION flip() RETURNS void LANGUAGE sql AS 'SELECT 1';
CREATE TABLE t (id int CHECK (id > 0)) TABLESPACE fast;
CREATE INDEX t_id ON t (id) TABLESPACE fast;
`

/** `facts` after `sql`, statement by statement */
function follow(sql: string, facts: Facts = emptyFacts("public")): Facts {
	for (const raw of postgresParser().parseSync(sql).stmts as unknown[]) followTree([raw], facts)
	return facts
}

const unseen = (sql: string, facts: Facts): boolean => runsUnseen(nodesOf(postgresParser().parseSync(sql).stmts), facts)

describe("runsUnseen", () => {
	it.each([
		["DO $$ BEGIN END $$", true],
		["CALL p()", true],
		["SELECT flip()", true],
		["INSERT INTO t SELECT 1 WHERE flip() IS NULL", true],
		["SELECT upper('a')", false],
		["CREATE FUNCTION g() RETURNS void LANGUAGE sql BEGIN ATOMIC SELECT flip(); END", false],
		["ALTER TABLE t SET LOGGED", false],
	])("reads %j as running code its text does not show: %s", (sql, runs) => {
		expect(unseen(sql, follow(HISTORY))).toBe(runs)
	})
})

describe("forgetUnseen", () => {
	it("forgets every relation's storage, every index's tablespace and every CHECK's proof", () => {
		const facts = follow(HISTORY)
		expect([facts.storage.size > 0, facts.indexes.get("t_id")?.tablespace, facts.proofs.size > 0]).toEqual([
			true,
			"fast",
			true,
		])
		forgetUnseen(facts)
		expect([facts.storage.size, facts.indexes.get("t_id")?.tablespace, facts.proofs.size]).toEqual([0, undefined, 0])
	})
})
