/**
 * PA10 of r23: a pending txmode none file whose version sorts below one applied made status throw,
 * printing no list. Status lists the history and names the file; check and apply still refuse it.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { applyWithAtlas, statusWithAtlas } from "./atlas-apply.ts"
import type { MigrateRun } from "./process.ts"
import { fakeAtlas, file, ranWhole, status } from "../../../tests/support/fake-atlas.ts"

let dir = ""
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "database-atlas-unresumable-"))
	writeFileSync(join(dir, "20260101000000_b.sql"), "SELECT 1;\n")
	writeFileSync(join(dir, "20260101_a.sql"), "-- atlas:txmode none\n\nVACUUM;\n")
	/* the fake atlas.sum's hashes, each file's name length */
	writeFileSync(join(dir, "atlas.sum"), "h1:x=\n20260101000000_b.sql h1:20=\n20260101_a.sql h1:14=\n")
})
afterEach(() => rmSync(dir, { force: true, recursive: true }))

function options(exec: MigrateRun) {
	const out: string[] = []
	return {
		approve: async () => ({ ok: true as const }),
		dir,
		exec,
		out,
		print: (line: string) => out.push(line),
		target: { devUrl: "postgres://localhost/dev", lockTimeout: "5s", schema: "public", url: "postgres://db/app" },
	}
}

/** Atlas's status: 20260101000000_b.sql applied, 20260101_a.sql pending below its version */
const late = () =>
	fakeAtlas({
		status: status({
			applied: [ranWhole("20260101000000_b.sql")],
			available: [file("20260101000000_b.sql"), file("20260101_a.sql")],
			current: "20260101000000",
			pending: [file("20260101_a.sql")],
			status: "PENDING",
		}),
	})

const WHY =
	"20260101_a.sql runs outside a transaction (atlas:txmode none), yet its version sorts below 20260101000000_b.sql's, which runs before it, and Atlas resumes such a file only while its version is the highest applied, so a failure halfway would stay; rename it so its version sorts above 20260101000000 and run atlas migrate hash"

describe("a pending txmode none file Atlas would not resume (PA10 of r23)", () => {
	it("is listed by status, which names why", async () => {
		const run = options(late())
		expect(await statusWithAtlas(run)).toEqual({ applied: ["20260101000000_b.sql"], pending: ["20260101_a.sql"] })
		expect(run.out).toEqual(["Applied: 1 (up to 20260101000000)", "Pending: 20260101_a.sql", WHY])
	})

	it("is refused by check and by apply (siblings)", async () => {
		await expect(applyWithAtlas({ ...options(late()), checkOnly: true })).rejects.toThrow(WHY)
		await expect(applyWithAtlas(options(late()))).rejects.toThrow(WHY)
	})
})
