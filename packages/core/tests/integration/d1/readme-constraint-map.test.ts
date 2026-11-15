/**
 * QE4 of r22b on D1: README's constraint-map example, keyed as codegen writes it, runs as written
 * through classifyD1Error on Miniflare, as it does through classifySqliteError on libsql. QE1 and
 * QE2 of r23: a constraint failing in a row other than the statement's own answers as on libsql.
 */
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { classifyD1Error } from "../../../src/sqlite/d1/error-handler.ts"
import { type D1Harness, d1Memory } from "../support/d1.ts"
import { ELSEWHERE_CASES, ELSEWHERE_DDL, ELSEWHERE_MAPS } from "../support/elsewhere-constraints.ts"
import { README_MAP_CASES, README_MAP_DDL, readmeConstraintMap } from "../support/readme-constraint-map.ts"

describe("README's constraint map on D1 (QE4 of r22b; sibling: libsql's)", () => {
	let harness: D1Harness

	beforeEach(async () => {
		harness = await d1Memory()
		for (const statement of README_MAP_DDL) await harness.CORE.prepare(statement).run()
	})

	afterEach(() => harness.dispose())

	it.each(README_MAP_CASES)("maps $label as the README says", async ({ errorKey, statement, status }) => {
		/* through drizzle, as a Worker reads it: its error carries the statement, which names the table */
		const failure = await drizzle(harness.CORE)
			.run(sql.raw(statement))
			.then(
				() => new Error("the statement did not fail"),
				(error: unknown) => error,
			)
		expect(classifyD1Error(failure, [readmeConstraintMap()])).toMatchObject({ errorKey, status })
	})
})

describe("a constraint failing in another row on D1 (QE1, QE2 of r23; sibling: libsql's and bun:sqlite's)", () => {
	let harness: D1Harness

	beforeEach(async () => {
		harness = await d1Memory()
		/* D1 enforces foreign keys itself and refuses the PRAGMA's write */
		for (const statement of ELSEWHERE_DDL.slice(1)) await harness.CORE.prepare(statement).run()
	})

	afterEach(() => harness.dispose())

	it.each(ELSEWHERE_CASES)("answers $label", async ({ expected, statement }) => {
		const failure = await drizzle(harness.CORE)
			.run(sql.raw(statement))
			.then(
				() => new Error("the statement did not fail"),
				(error: unknown) => error,
			)
		expect(classifyD1Error(failure, ELSEWHERE_MAPS)).toMatchObject(expected)
	})
})
