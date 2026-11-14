/**
 * The D1 proof differential (plan 25's 2.4): generated live schemas and pending files that drop, rename and add
 * what triggers and views use, each checked by the tip's and 0.21.0's `database migrate check`, and held to what D1
 * local then does with the file and an app's reads and writes. The fixed seeds and one fresh seed per run, printed;
 * the expectations table names the findings still open on each version. 0.20.1 is not compared: the D1 engine
 * proof under test came in 0.21.0 (SD1 of r22), so 0.20.1 has none.
 */
import { pathToFileURL } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { expectedRed, judgeProof, reconcile, type Result, shownBy } from "./support/judge.ts"
import { entryOf, type Version } from "./support/oracles.ts"
import { proofCase } from "./support/proof-cases.ts"
import { type Cli, checkOf, copyOf, projectOf, truthD1 } from "./support/proof.ts"
import { random, runSeeds } from "./support/random.ts"

const VERSIONS: readonly Version[] = ["tip", "0.21.0"]
/* cases drawn from each seed: a check costs about 3 s, of wrangler's reads and a proof child per version */
const CASES_PER_SEED = 2
/* the cases checked at once, each a proof child per version; the suites run one after another, so nothing else shares the CPU */
const AT_ONCE = 3

const seeds = runSeeds()
console.log(`proof differential: fixed seeds ${seeds.fixed.join(",")}; fresh seed ${seeds.fresh.join(",")}`)

const clis = new Map<Version, Cli>()
for (const version of VERSIONS)
	clis.set(version, (await import(pathToFileURL(entryOf(version, "entry-cli.ts")).href)) as Cli)
const d1 = await truthD1()
afterAll(() => d1.dispose())

/** Every version's verdict on one case, each checking a project of its own */
async function runCase(seed: number, index: number, c: ReturnType<typeof proofCase>): Promise<Result[]> {
	const truth = await d1.truthOf(c)
	const project = projectOf(c)
	try {
		return await Promise.all(
			VERSIONS.map(async (version) => {
				const copy = copyOf(project.dir)
				try {
					const verdict = judgeProof(await checkOf(clis.get(version) as Cli, copy.dir), truth)
					const label = c.ops.join(" ")
					return { driver: "d1", fixed: seeds.fixed.includes(seed), index, label, seed, verdict, version }
				} finally {
					copy.remove()
				}
			}),
		)
	} finally {
		project.remove()
	}
}

const results: Result[] = []

describe("each version's D1 check against what D1 does with the file", () => {
	it("passes exactly the files D1 applies and that leave every read and write working", async () => {
		const started = performance.now()
		const cases = [...seeds.fixed, ...seeds.fresh].flatMap((seed) => {
			const draw = random(seed)
			return Array.from({ length: CASES_PER_SEED }, (_, index) => ({ c: proofCase(draw), index, seed }))
		})
		const queue = [...cases]
		await Promise.all(
			Array.from({ length: AT_ONCE }, async () => {
				for (let next = queue.shift(); next !== undefined; next = queue.shift())
					results.push(...(await runCase(next.seed, next.index, next.c)))
			}),
		)
		const { expected, reported, unexpected } = reconcile(results)
		const passed = (version: Version) =>
			results.filter((r) => r.version === version && r.verdict.kind === "pass").length
		console.log(
			`proof: ${cases.length} cases in ${Math.round(performance.now() - started)} ms; ${VERSIONS.map((v) => `${v} ${passed(v)} pass`).join(", ")}`,
		)
		console.log(`the failures the expectations name:\n${expected.join("\n")}`)
		if (reported.length > 0) console.log(`what the releases fail that no expectation names:\n${reported.join("\n")}`)
		expect(unexpected).toEqual([])
	})

	for (const { shape, title, version } of expectedRed("proof", VERSIONS))
		it(title, () => {
			expect(shownBy(results, shape, version), `no fixed seed shows ${shape} on ${version}`).not.toEqual([])
		})
})
