/**
 * The list differential (plan 25's 2.3): generated tables and list requests, each walked by the tip, by 0.21.0 and
 * by 0.20.1 on libsql and on D1 local, and held to the engine's own ORDER BY: every row exactly once, in order, or
 * a refusal the walk's mode allows. The fixed seeds and one fresh seed per run, printed; the expectations table
 * names the findings still open on each version. bun:sqlite runs in tests/bun/differential-lists.test.ts.
 */
import { pathToFileURL } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { d1Driver, libsqlDriver } from "./support/drivers.ts"
import { expectedRed, reconcile, type Result, shownBy } from "./support/judge.ts"
import type { Driver, Lib } from "./support/lists.ts"
import { entryOf, VERSIONS, type Version } from "./support/oracles.ts"
import { runSeeds } from "./support/random.ts"
import { CASES_PER_SEED, runLists, tally } from "./support/run-lists.ts"

const seeds = runSeeds()
console.log(`list differential: fixed seeds ${seeds.fixed.join(",")}; fresh seed ${seeds.fresh.join(",")}`)

const libs = new Map<Version, Lib>()
for (const version of VERSIONS) libs.set(version, (await import(pathToFileURL(entryOf(version)).href)) as Lib)

const results: Result[] = []
const d1 = new Map<Version, Awaited<ReturnType<typeof d1Driver>>>()
for (const version of VERSIONS) d1.set(version, await d1Driver())
afterAll(() => Promise.all([...d1.values()].map((driver) => driver.dispose())))
/*
 * D1 local walks the first cases of each seed: a walk there costs a round trip to workerd per statement, and the
 * whole of each seed took 7 s a seed alone and three times that beside the proof suite. libsql and bun:sqlite walk
 * every case, the same ones. COMB_DIFFERENTIAL_D1_CASES=40 walks D1 as wide locally.
 */
const D1_CASES = Number(process.env["COMB_DIFFERENTIAL_D1_CASES"] ?? 10)
if (!Number.isSafeInteger(D1_CASES) || D1_CASES < 1) throw new Error(`COMB_DIFFERENTIAL_D1_CASES: ${D1_CASES}`)
const DRIVERS: Array<{ cases: number; drivers: ReadonlyMap<Version, Driver>; name: string }> = [
	{ cases: CASES_PER_SEED, drivers: new Map(VERSIONS.map((version) => [version, libsqlDriver])), name: "libsql" },
	{ cases: D1_CASES, drivers: d1, name: "d1" },
]

describe("lists built by each version against the engine's own order", () => {
	it.each(DRIVERS)("on $name", async ({ cases, drivers, name }) => {
		const started = performance.now()
		const mine = await runLists(drivers, libs, seeds, cases)
		results.push(...mine)
		const { expected, reported, unexpected } = reconcile(mine)
		console.log(`${name}: ${Math.round(performance.now() - started)} ms\n${tally(mine).join("\n")}`)
		console.log(`the failures the expectations name:\n${expected.join("\n")}`)
		if (reported.length > 0) console.log(`what the releases fail that no expectation names:\n${reported.join("\n")}`)
		expect(unexpected).toEqual([])
	})

	for (const { shape, title, version } of expectedRed("lists", VERSIONS))
		it(title, () => {
			expect(shownBy(results, shape, version), `no fixed seed shows ${shape} on ${version}`).not.toEqual([])
		})
})
