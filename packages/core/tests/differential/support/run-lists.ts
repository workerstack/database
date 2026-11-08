/**
 * One run of the list differential on a driver: every seed's cases, each walked by every version, each walk judged
 * against the engine. lists.test.ts runs it under vitest on libsql and D1, the bun twin on bun:sqlite; both then
 * reconcile the results with the expectations table.
 */
import { judgeList, type Result } from "./judge.ts"
import { labelOf, listCase } from "./list-cases.ts"
import { type Driver, type Lib, truthOf, walk } from "./lists.ts"
import type { Version } from "./oracles.ts"
import { random } from "./random.ts"

/* cases drawn from each seed on an in-process driver; D1 local walks a prefix of them (lists.test.ts) */
export const CASES_PER_SEED = 40

/**
 * The results of the first `cases` cases of each of `seeds`, each walked by every version in `libs` at once, each on its own driver
 * (D1's are separate Miniflares, so one version's statements do not queue behind another's). The engine's
 * answer does not depend on the version, so the first driver computes it once per case.
 */
export async function runLists(
	drivers: ReadonlyMap<Version, Driver>,
	libs: ReadonlyMap<Version, Lib>,
	{ fixed, fresh }: { fixed: readonly number[]; fresh: readonly number[] },
	cases = CASES_PER_SEED,
): Promise<Result[]> {
	const [[first, truthDriver]] = [...drivers] as [[Version, Driver]]
	const results: Result[] = []
	for (const seed of [...fixed, ...fresh]) {
		const draw = random(seed)
		for (let index = 0; index < cases; index++) {
			const c = listCase(draw, truthDriver.reads)
			const truth = await truthOf(truthDriver, libs.get(first) as Lib, c)
			const verdicts = await Promise.all(
				[...drivers].map(async ([version, driver]) => ({
					verdict: judgeList(c, await walk(driver, libs.get(version) as Lib, c), truth),
					version,
				})),
			)
			for (const { verdict, version } of verdicts)
				results.push({
					driver: truthDriver.name,
					fixed: fixed.includes(seed),
					index,
					label: labelOf(c),
					seed,
					verdict,
					version,
				})
		}
	}
	return results
}

/** A one-line tally per version: how many walks passed, were refused, failed as a finding expects, or failed otherwise */
export function tally(results: readonly Result[]): string[] {
	const versions = [...new Set(results.map((r) => `${r.version} ${r.driver}`))]
	return versions.map((key) => {
		const mine = results.filter((r) => `${r.version} ${r.driver}` === key)
		const count = (test: (r: Result) => boolean) => mine.filter(test).length
		const findings = [
			...new Set(mine.flatMap((r) => (r.verdict.kind === "fail" && r.verdict.shape ? [r.verdict.shape] : []))),
		]
		const byFinding = findings.map((id) => `${id} ${count((r) => r.verdict.kind === "fail" && r.verdict.shape === id)}`)
		return `${key}: ${mine.length} walks, ${count((r) => r.verdict.kind === "pass")} pass, ${count((r) => r.verdict.kind === "refused")} refused, ${count((r) => r.verdict.kind === "fail" && r.verdict.shape === undefined)} unclassified${byFinding.length ? `, ${byFinding.join(", ")}` : ""}`
	})
}
