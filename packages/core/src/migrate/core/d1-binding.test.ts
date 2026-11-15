import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type D1Target, localD1Path, resolveBinding, wranglerReader } from "./d1-binding.ts"
import type { MigrateRun, ProjectBin } from "./process.ts"
import { main, readConfig } from "./wrangler-config-child.mjs"

const file = (name: string) => join("/w", ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject", name)

/* M33 of the 0.13 review; tests/integration/d1 holds it to the wrangler database pins */
describe("localD1Path", () => {
	it("names the file as Miniflare's idFromName does: the preview id, else the id, else the binding", () => {
		const id = "00000000-0000-0000-0000-000000000000"
		const at = file("9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite")
		expect(localD1Path("/w", { binding: "CORE", database_id: id })).toBe(at)
		expect(localD1Path("/w", { binding: "CORE", database_id: "x", preview_database_id: id })).toBe(at)
		expect(localD1Path("/w", { binding: "C" })).toBe(
			file("edac2be004a4f4cc6b475e4b0e02d519ca9bf3d68ca97c0e8de3728dcfd3d80d.sqlite"),
		)
	})
})

/* D2-8 of the area D round-two review: wrangler's bare parse token named no file */
describe("resolveBinding: a wrangler config its reader fails on", () => {
	it("names the config, with what the reader threw as its cause", () => {
		const target = { name: "core", wranglerConfig: "/w/wrangler.jsonc" } as D1Target
		for (const thrown of [new Error("CloseBracketExpected"), "CloseBracketExpected"]) {
			const read = () => {
				throw thrown
			}
			let caught: unknown
			try {
				resolveBinding(read, target)
			} catch (error) {
				caught = error
			}
			expect(caught).toBeInstanceOf(Error)
			expect({ cause: (caught as Error).cause, message: (caught as Error).message }).toEqual({
				cause: thrown,
				message: "/w/wrangler.jsonc failed to load: CloseBracketExpected",
			})
		}
	})
})

const dirs: string[] = []
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true })
})

/** A wrangler whose reader prints to stdout, as wrangler's does, past any console capture, and answers `body` for the config it is asked */
function fakeWrangler(body: string): ProjectBin {
	const dir = mkdtempSync(join(tmpdir(), "database-fake-wrangler-"))
	dirs.push(dir)
	const manifest = join(dir, "package.json")
	writeFileSync(manifest, JSON.stringify({ main: "index.js", name: "wrangler", type: "module", version: "4.150.0" }))
	writeFileSync(
		join(dir, "index.js"),
		`export function unstable_readConfig({ config, env }) { process.stdout.write("▲ [WARNING] Processing " + config + "\\n"); ${body} }`,
	)
	return { bin: join(dir, "index.js"), manifest, peer: "wrangler", runtime: "node" }
}

const REF = { wranglerConfig: "/w/wrangler.jsonc", wranglerEnv: "staging" }
const BINDINGS = `return { d1_databases: [{ binding: "CORE", database_name: env, migrations_dir: config }] }`

/* a node that refused its options and wrote no answer */
const BAD_OPTION: MigrateRun = async () => ({ code: 1, stderr: "node: bad option\n", stdout: "" })

/* KC1 of r23: wrangler's reader ran in database's process, and what it printed landed on stdout ahead of --json's object */
describe("wranglerReader: the wrangler config, read in a child on wrangler's runtime", () => {
	it("answers the bindings wrangler reads for the config and environment, and prints nothing of what it prints", async () => {
		const writes = vi.spyOn(process.stdout, "write")
		try {
			const read = await wranglerReader(fakeWrangler(BINDINGS), REF)
			expect(read({ config: REF.wranglerConfig, env: REF.wranglerEnv })).toEqual({
				d1_databases: [{ binding: "CORE", database_name: "staging", migrations_dir: "/w/wrangler.jsonc" }],
			})
			expect(writes.mock.calls.flat().join("")).not.toContain("WARNING")
		} finally {
			writes.mockRestore()
		}
	})

	it("refuses a read of a config or an environment it did not read", async () => {
		const read = await wranglerReader(fakeWrangler(BINDINGS), REF)
		expect(() => read({ config: "/x/wrangler.toml", env: REF.wranglerEnv })).toThrow(
			"wrangler's config was read for /w/wrangler.jsonc (env staging), not /x/wrangler.toml (env staging)",
		)
		expect(() => read({ config: REF.wranglerConfig })).toThrow(
			"wrangler's config was read for /w/wrangler.jsonc (env staging), not /w/wrangler.jsonc",
		)
		const bare = await wranglerReader(fakeWrangler(BINDINGS), { wranglerConfig: "/w/wrangler.jsonc" })
		expect(() => bare({ config: "/w/wrangler.jsonc", env: "prod" })).toThrow(
			"wrangler's config was read for /w/wrangler.jsonc, not /w/wrangler.jsonc (env prod)",
		)
	})

	it("names the config with the message wrangler's reader refused it with, an Error or not", async () => {
		const target = { ...REF, name: "core" } as D1Target
		for (const body of [`throw new Error("CloseBracketExpected")`, `throw "CloseBracketExpected"`]) {
			const read = await wranglerReader(fakeWrangler(body), REF)
			expect(() => resolveBinding(read, target)).toThrow("/w/wrangler.jsonc failed to load: CloseBracketExpected")
		}
	})

	it("names the config and how the read ended when it wrote no answer", async () => {
		await expect(wranglerReader(fakeWrangler(BINDINGS), REF, { exec: BAD_OPTION })).rejects.toThrow(
			"/w/wrangler.jsonc failed to load: wrangler's config read on node ended with code 1 and no answer: node: bad option",
		)
	})

	it("refuses inside a Bun single-file executable, before anything runs", async () => {
		const exec = vi.fn<MigrateRun>()
		await expect(
			wranglerReader(fakeWrangler(BINDINGS), REF, { exec, moduleUrl: "file:///$bunfs/root/app-exe" }),
		).rejects.toThrow("database loads wrangler from the project, which a Bun single-file executable cannot do")
		expect(exec).not.toHaveBeenCalled()
	})
})

describe("the wrangler config read's child, run in this process as node runs it", () => {
	it("answers the bindings, or the message the reader refused the config with", async () => {
		const bin = fakeWrangler(BINDINGS)
		const dir = mkdtempSync(join(tmpdir(), "database-config-input-"))
		dirs.push(dir)
		const input = join(dir, "input.json")
		writeFileSync(input, JSON.stringify({ config: "/c", wrangler: join(dirname(bin.manifest), "index.js") }))
		expect(await main(input)).toEqual({ config: { d1_databases: [{ binding: "CORE", migrations_dir: "/c" }] } })
		for (const [body, error] of [
			[`throw 7`, "7"],
			[`throw new Error("CloseBracketExpected")`, "CloseBracketExpected"],
		]) {
			const refusing = fakeWrangler(body)
			expect(await readConfig({ config: "/c", wrangler: join(dirname(refusing.manifest), "index.js") })).toEqual({
				error,
			})
		}
	})
})
