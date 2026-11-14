/**
 * KC3 of r23: a signal that stops wrangler after it applied some of the pending files says which it
 * recorded and which it did not, read from the table wrangler records in, and returns that report
 * for the step a command holds before it (the `--json` object).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { deliver, stubKill, until } from "../../../tests/support/signals.ts"
import { asWrangler, fakeD1, localD1, wranglerBin, writeSum } from "../../cli/__fixtures__/d1.ts"
import { createD1Provider } from "../drivers/d1.ts"
import { approveMigration } from "./approval.ts"
import { hold } from "./cleanup.ts"
import type { D1Target, ReadConfig } from "./d1-binding.ts"
import { applyD1 } from "./d1-history.ts"
import { Stopped } from "./stopped.ts"

let dir = ""
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "database-d1-stopped-"))
})
afterEach(() => rmSync(dir, { force: true, recursive: true }))

const approve = (migration: Parameters<typeof approveMigration>[0]) =>
	approveMigration(migration, { target: "core", yes: true })

const read: ReadConfig = () => ({ d1_databases: [{ binding: "CORE" }] })

/** A local D1 with three pending files, on a fake wrangler that applies the first two and is signalled as it ends */
async function signalledAfterTwo(): Promise<D1Target> {
	const migrations = join(dir, "migrations")
	mkdirSync(migrations)
	const sql = { "1_a.sql": "CREATE TABLE a (id TEXT);", "2_b.sql": "CREATE TABLE b (id TEXT);" }
	for (const [name, text] of Object.entries({ ...sql, "3_c.sql": "CREATE TABLE c (id TEXT);" }))
		writeFileSync(join(migrations, name), text)
	writeSum(migrations)
	const run = fakeD1({ dir: migrations })
	const exec = asWrangler(async (cmd, args, options) => {
		if (cmd !== "wrangler" || args[1] !== "migrations") return run(cmd, args, options)
		/* wrangler sees the third file only once its run has ended */
		rmSync(join(migrations, "3_c.sql"))
		const result = await run(cmd, args, options)
		writeFileSync(join(migrations, "3_c.sql"), "CREATE TABLE c (id TEXT);")
		await deliver("SIGTERM")
		return result
	})
	const config = { databaseName: "core", local: true, type: "d1" as const }
	const conn = await createD1Provider(config, exec).connect({
		migrationsDir: migrations,
		name: "core",
		provider: config,
	})
	localD1(dir, { binding: "CORE" })
	return {
		conn,
		exec,
		flags: ["--local"],
		held: async () => false,
		migrationsDir: migrations,
		name: "CORE",
		wrangler: wranglerBin(),
		wranglerConfig: join(dir, "wrangler.toml"),
	}
}

describe("applyD1 stopped by a signal", () => {
	const kill = stubKill()

	it("says which files wrangler recorded and which it did not, and returns that report", async () => {
		const [lines, last] = [[] as string[], vi.fn()]
		const release = hold(last)
		await applyD1(await signalledAfterTwo(), { approve, print: (line) => lines.push(line), read }).catch(
			() => undefined,
		)
		await until(() => kill.calls().length > 0, "the end the stop asks for")
		release()
		const [[, earlier]] = last.mock.calls as Array<[string, unknown[]]>
		expect([
			lines.filter((line) => line.startsWith("Stopped by")),
			earlier.filter((each) => each instanceof Stopped),
			kill.calls(),
		]).toEqual([
			["Stopped by SIGTERM: applied 1_a.sql, 2_b.sql; not applied 3_c.sql"],
			[
				expect.objectContaining({
					applied: ["1_a.sql", "2_b.sql"],
					pending: ["3_c.sql"],
					signal: "SIGTERM",
					unknown: [],
				}),
			],
			[[process.pid, "SIGTERM"]],
		])
	})
})
