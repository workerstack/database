/**
 * PA11 of r23: Atlas lists applied revisions in the database's collation order, so status said
 * "up to" a file that does not sort last by name, and listed the files in that order. Status reads
 * them in file-name order, as Atlas orders the files themselves.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { baselineWithAtlas, statusWithAtlas } from "./atlas-apply.ts"
import type { MigrateRun } from "./process.ts"
import { fakeAtlas, file, ranWhole, status } from "../../../tests/support/fake-atlas.ts"

let dir = ""
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "database-atlas-order-"))
})
afterEach(() => rmSync(dir, { force: true, recursive: true }))

/** A directory of `names`, each applied, with the fake atlas.sum's hashes (each file's name length) */
function applied(names: readonly string[]): MigrateRun {
	for (const name of names) writeFileSync(join(dir, name), "SELECT 1;\n")
	writeFileSync(
		join(dir, "atlas.sum"),
		`h1:x=\n${names
			.toSorted()
			.map((name) => `${name} h1:${name.length}=`)
			.join("\n")}\n`,
	)
	return fakeAtlas({
		status: status({
			applied: names.map(ranWhole),
			available: names.map(file),
			current: (names.at(-1) as string).split("_")[0] as string,
			pending: [],
			status: "OK",
		}),
	})
}

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

describe("the applied files status lists, in a collation that sorts them apart from their names (PA11 of r23)", () => {
	it.each([
		[["15_b.sql", "1.6_a.sql"], ["1.6_a.sql", "15_b.sql"], "15"],
		[["20260101_a.sql", "20260101000000_b.sql"], ["20260101000000_b.sql", "20260101_a.sql"], "20260101"],
	])("lists %j by file name, up to the one that sorts last", async (listed, sorted, last) => {
		const run = options(applied(listed))
		expect(await statusWithAtlas(run)).toEqual({ applied: sorted, pending: [] })
		expect(run.out).toEqual([`Applied: 2 (up to ${last})`, "Pending: none"])
	})

	it("names the last by file name when baseline refuses a database that records migrations", async () => {
		await expect(baselineWithAtlas(options(applied(["15_b.sql", "1.6_a.sql"])))).rejects.toThrow(
			"the database already records 2 migrations (up to 15); baseline marks a database that has none",
		)
	})
})
