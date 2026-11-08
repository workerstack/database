/**
 * The release workflow creates the GitHub release only once every publish it needs succeeded, so no
 * release names a version a registry lacks. An `if:` on the job replaces the default `success()`, so
 * it must check each needed job's result itself.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const WORKFLOWS = join(import.meta.dirname, "../../../../.github/workflows")
const RELEASE = join(WORKFLOWS, "release.yml")

/** A job's `needs` and its `if:` expression, read from its block of `yaml` */
export function jobGate(yaml: string, job: string): { condition: string | undefined; needs: string[] } {
	const start = yaml.search(new RegExp(`^ {2}${job}:$`, "m"))
	if (start === -1) throw new Error(`no job ${job}`)
	const rest = yaml.slice(start + 1)
	const end = rest.search(/^ {2}[\w-]+:$/m)
	const block = end === -1 ? rest : rest.slice(0, end)
	const needs =
		/^ {4}needs:\s*\[([^\]]*)\]$/m
			.exec(block)?.[1]
			?.split(",")
			.map((name) => name.trim()) ?? []
	const condition = /^ {4}if:\s*(.+?)\s*$/m.exec(block)?.[1]
	return { condition, needs }
}

/** The jobs `needs` lists whose success `condition` does not require: all of them when it replaces success() unchecked */
export function unchecked({ condition, needs }: ReturnType<typeof jobGate>): string[] {
	if (condition === undefined) return []
	return needs.filter((need) => !condition.includes(`needs.${need}.result == 'success'`))
}

describe("the GitHub release", () => {
	it("is created only when every publish job it needs succeeded", () => {
		const gate = jobGate(readFileSync(RELEASE, "utf8"), "github-release")
		expect(gate.needs).toEqual(["npmjs", "gh-pkg"])
		expect(unchecked(gate)).toEqual([])
	})

	it("reads a job's gate, and counts a need its if: leaves unchecked", () => {
		const yaml =
			"jobs:\n  a:\n    run: x\n  r:\n    needs: [a, b]\n    if: ${{ needs.b.result == 'success' }}\n  z:\n    run: y\n"
		expect(jobGate(yaml, "r")).toEqual({ condition: "${{ needs.b.result == 'success' }}", needs: ["a", "b"] })
		expect(unchecked(jobGate(yaml, "r"))).toEqual(["a"])
		expect(unchecked({ condition: undefined, needs: ["a"] })).toEqual([])
		expect(jobGate(yaml, "a")).toEqual({ condition: undefined, needs: [] })
		expect(() => jobGate(yaml, "q")).toThrow("no job q")
	})
})

/** The jobs of a workflow by name, each with its own block of lines */
function jobsOf(yaml: string): Map<string, string> {
	const body = yaml.slice(yaml.search(/^jobs:\n/m) + "jobs:\n".length)
	const blocks = body.split(/^(?= {2}[\w-]+:$)/m).filter((block) => /^ {2}[\w-]+:$/m.test(block))
	return new Map(blocks.map((block) => [/^ {2}([\w-]+):$/m.exec(block)?.[1] as string, block]))
}

/* a step that runs a suite: `bun run [--filter <package>] test…`, other than the coverage job's merge of the shards */
const SUITE = /^\s+-?\s*run: bun run (?:--filter \S+ )?test(?!:coverage --merge-reports)\S*/m

/*
 * The release reruns no test: its ci job passes once ci.yml's push run on the tagged commit concluded success
 * (.github/scripts/release-ci-gate.sh, through scripts/ci-wait.ts). A suite job gates the release only if that run
 * cannot succeed without it: it runs on every push to main, with no `if:` of its own, and its failure fails the run.
 */
describe("the release's gate on CI", () => {
	const ci = readFileSync(join(WORKFLOWS, "ci.yml"), "utf8")
	const suites = [...jobsOf(ci)].filter(([, block]) => SUITE.test(block))

	it("waits for ci.yml's run on the tagged commit before any publish", () => {
		expect(jobGate(readFileSync(RELEASE, "utf8"), "npmjs").needs).toEqual(["ci"])
		expect(readFileSync(RELEASE, "utf8")).toContain("run: .github/scripts/release-ci-gate.sh")
		expect(ci).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]$/m)
	})

	it("needs every suite job, the differential one among them: none skips a push or fails without failing the run", () => {
		expect(suites.map(([name]) => name)).toEqual(
			expect.arrayContaining(["test", "test-bun", "e2e", "consumers", "differential"]),
		)
		const loose = suites.flatMap(([name, block]) => [
			...(jobGate(ci, name).condition === undefined ? [] : [`${name}: if: ${jobGate(ci, name).condition}`]),
			...(/continue-on-error/.test(block) ? [`${name}: continue-on-error`] : []),
		])
		expect(loose).toEqual([])
	})

	it("reads a suite job by its run step, and not the coverage merge", () => {
		expect(SUITE.test("      - run: bun run test:differential")).toBe(true)
		expect(SUITE.test("      - run: bun run --filter @lovrozagar/comb test:e2e")).toBe(true)
		expect(SUITE.test("      - run: bun run test:coverage --merge-reports")).toBe(false)
		expect(SUITE.test("      - run: bun run lint")).toBe(false)
	})
})
