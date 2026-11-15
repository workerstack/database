import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { endedWith, runChild } from "./node-child.ts"
import { type MigrateRun, type ProjectBin, run } from "./process.ts"

const BIN: ProjectBin = { bin: "/w/bin.js", manifest: "/w/package.json", peer: "wrangler", runtime: "node" }

const dirs: string[] = []
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true })
})

/** A child module whose `main` prints, as wrangler does, then answers `answer` and the input it was handed */
function childModule(answer: string): URL {
	const dir = mkdtempSync(join(tmpdir(), "database-node-child-"))
	dirs.push(dir)
	const file = join(dir, "child.mjs")
	writeFileSync(
		file,
		`import { readFileSync } from "node:fs"
export async function main(input) {
	console.log("a banner on stdout")
	return { answer: ${answer}, input: JSON.parse(readFileSync(input, "utf8")) }
}`,
	)
	return pathToFileURL(file)
}

const scratch = (prefix: string) => readdirSync(tmpdir()).filter((name) => name.startsWith(prefix))

/* a child that ended with code 3 and wrote no answer */
const ENDED: MigrateRun = async () => ({ code: 3, stderr: " boom \n", stdout: "" })

describe("runChild: a module of database's in a child on wrangler's runtime", () => {
	it("answers what the child wrote, from the input made in its scratch directory, and removes the directory", async () => {
		let made = ""
		const ran: Array<readonly string[]> = []
		const exec: MigrateRun = (cmd, args, options) => {
			ran.push([cmd, ...args, options?.peer ?? ""])
			return run(cmd, args)
		}
		const answer = await runChild<{ answer: number; input: unknown }>(childModule("42"), {
			bin: BIN,
			exec,
			failed: () => "unreached",
			inputOf: (dir) => {
				made = dir
				return { at: "input" }
			},
			prefix: "database-node-child-test-",
		})
		expect(answer).toEqual({ answer: 42, input: { at: "input" } })
		expect(ran[0]?.[0]).toBe("node")
		expect(ran[0]?.at(-1)).toBe("wrangler")
		expect(existsSync(made)).toBe(false)
	})

	it("throws what `failed` makes of how a child that wrote no answer ended, and removes the directory", async () => {
		await expect(
			runChild(childModule("1"), {
				bin: BIN,
				exec: ENDED,
				failed: (ran) => `the read ${endedWith(ran)}`,
				inputOf: () => ({}),
				prefix: "database-node-child-none-",
			}),
		).rejects.toThrow("the read ended with code 3 and no answer: boom")
		expect(scratch("database-node-child-none-")).toEqual([])
	})

	it("says the child printed nothing when its stderr is empty", () => {
		expect(endedWith({ code: 0, stderr: "  ", stdout: "" })).toBe("ended with code 0 and no answer: it printed nothing")
	})
})
