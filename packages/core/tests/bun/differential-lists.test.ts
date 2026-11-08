/// <reference types="bun-types" />
/**
 * The list differential on bun:sqlite (plan 25's 2.2), the twin of tests/differential/lists.test.ts, which vitest
 * runs on libsql and D1 local but cannot load bun:sqlite for. The same generated cases, each walked by the tip, by
 * 0.21.0 and by 0.20.1, each version's drizzle on its own bun:sqlite database, held to the engine's own ORDER BY,
 * and reconciled with the same expectations table.
 */
import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { pathToFileURL } from "node:url"
import { expectedRed, reconcile, type Result, shownBy } from "../differential/support/judge.ts"
import type { Db, Driver, Lib } from "../differential/support/lists.ts"
import { entryOf, installOracle, ORACLES, VERSIONS, type Version } from "../differential/support/oracles.ts"
import { runSeeds } from "../differential/support/random.ts"
import { runLists, tally } from "../differential/support/run-lists.ts"

for (const version of ORACLES) installOracle(version)
const seeds = runSeeds()
console.log(`bun:sqlite list differential: fixed seeds ${seeds.fixed.join(",")}; fresh seed ${seeds.fresh.join(",")}`)

/* each version's entry and its bun:sqlite drizzle, which only bun can load (entry-bun.ts) */
const libs = new Map<Version, Lib>()
for (const version of VERSIONS) {
	const entry = (await import(pathToFileURL(entryOf(version)).href)) as Lib
	const bun = (await import(pathToFileURL(entryOf(version, "entry-bun.ts")).href)) as { bunDrizzle: unknown }
	libs.set(version, { ...entry, ...bun } as Lib)
}

/** bun:sqlite, a new in-memory database per open */
const bunDriver: Driver = {
	name: "bun:sqlite",
	async open(lib, relations): Promise<Db> {
		const client = new Database(":memory:")
		const { bunDrizzle } = lib as unknown as { bunDrizzle: (options: object) => unknown }
		return {
			all: async (sql) => client.query(sql).all() as Array<Record<string, unknown>>,
			close: async () => client.close(),
			orm: bunDrizzle({ client, ...(relations && { relations }) }),
			run: async (...statements) => {
				for (const sql of statements) client.run(sql)
			},
		}
	},
	/* bun:sqlite reads an INTEGER past 2^53 as the double nearest it; drizzle's buffer mode hands a REAL to Buffer.from */
	reads: { bigints: false, blobNumbers: false },
}

const results: Result[] = []

describe("lists built by each version against the engine's own order, on bun:sqlite", () => {
	it("serves every row once in the engine's order, or a refusal its walk allows", async () => {
		const started = performance.now()
		results.push(...(await runLists(new Map(VERSIONS.map((version) => [version, bunDriver])), libs, seeds)))
		const { expected, reported, unexpected } = reconcile(results)
		console.log(`bun:sqlite: ${Math.round(performance.now() - started)} ms\n${tally(results).join("\n")}`)
		console.log(`the failures the expectations name:\n${expected.join("\n")}`)
		if (reported.length > 0) console.log(`what the releases fail that no expectation names:\n${reported.join("\n")}`)
		expect(unexpected).toEqual([])
	}, 300_000)

	for (const { shape, title, version } of expectedRed("lists", VERSIONS))
		it(title, () => {
			expect(shownBy(results, shape, version)).not.toEqual([])
		})
})
