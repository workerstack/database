/**
 * PA1 of r22b: Atlas applied every pending file on one session, so a plain SET in one file, which
 * outlives its COMMIT, changed what every later file of the run wrote, and a `SET lock_timeout = 0`
 * lifted the configured lockTimeout for the rest. comb applies each file on a session of its own,
 * as r21 S1 did for SQLite, and the check replay opens one per file to match.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import pg from "pg"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { approveMigration } from "../../../src/migrate/core/approval.ts"
import { applyWithAtlas } from "../../../src/migrate/core/atlas-apply.ts"
import { hashDir } from "../../../src/migrate/core/atlas-dir.ts"
import { loadPostgresParser } from "../../../src/migrate/core/pg-parser.ts"
import { run } from "../../../src/migrate/core/process.ts"
import type { ParsedMigration } from "../../../src/migrate/types.ts"
import { withScratchDb } from "../support/pg.ts"
import { query } from "../support/pg-roles.ts"

beforeAll(loadPostgresParser)

let dir = ""
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "comb-pg-session-per-file-"))
})
afterEach(() => rmSync(dir, { force: true, recursive: true }))

/** The files, named in order and hashed */
function write(files: readonly string[]): void {
	files.forEach((sql, i) => writeFileSync(join(dir, `2026010${i + 1}000000_f${i}.sql`), sql))
	hashDir(run, dir)
}

/** The options of a run against `url`, approving every file, with a 5 s lockTimeout */
const options = (devUrl: string, url: string, checkOnly = false) => ({
	approve: (m: ParsedMigration) => approveMigration(m, { target: "core", yes: true }),
	checkOnly,
	dir,
	print: () => undefined,
	target: { devUrl, lockTimeout: "5s", schema: "public", url },
})

/* r22b's x-set-leaks-data.ts: a SET comb rates safe, the later file that writes under it, and its read back */
const SETS: ReadonlyArray<[string, string, string]> = [
	[
		"SET standard_conforming_strings = off;",
		"CREATE TABLE notes (body text);\nINSERT INTO notes VALUES ('C:\\temp\\new');",
		"SELECT body AS v FROM notes",
	],
	[
		"SET timezone = 'Asia/Tokyo';",
		"CREATE TABLE ev (at timestamptz);\nINSERT INTO ev VALUES ('2026-01-01 00:00');",
		"SELECT (at AT TIME ZONE 'UTC')::text AS v FROM ev",
	],
	[
		"SET datestyle = 'SQL, DMY';",
		"CREATE TABLE due (d date);\nINSERT INTO due VALUES ('01/02/2026');",
		"SELECT d::text AS v FROM due",
	],
	[
		"SET client_encoding = 'LATIN1';",
		"CREATE TABLE names (n text);\nINSERT INTO names VALUES ('Zagreb – Žminj');",
		"SELECT n AS v FROM names",
	],
]

/** What `read` reads after an apply of a first file, with `set` or without, and then `later` */
async function written(set: string, later: string, read: string): Promise<unknown> {
	write([`CREATE TABLE base (x int);\n${set}\n`, `${later}\n`])
	return withScratchDb((dev) =>
		withScratchDb(async (url) => {
			await applyWithAtlas(options(dev, url))
			return (await query(url, read))[0]?.["v"]
		}),
	)
}

describe("a session SET in one file never reaches the next (PA1; sibling: r21 S1's per-file SQLite connection)", () => {
	it.each(SETS)("%s in one file leaves the next file's rows as it writes them alone", async (set, later, read) => {
		const alone = await written("", later, read)
		expect(await written(set, later, read)).toEqual(alone)
	}, 60_000)

	it("stops the file after one that sets lock_timeout = 0 at the configured lockTimeout", async () => {
		await withScratchDb((dev) =>
			withScratchDb(async (url) => {
				write(["CREATE TABLE t (x int);\n"])
				await applyWithAtlas(options(dev, url))
				write(["CREATE TABLE t (x int);\n", "SET lock_timeout = 0;\n", "ALTER TABLE t ADD COLUMN y int;\n"])
				/* a reader holds t for 20 s, past the 5 s lockTimeout */
				const reader = new pg.Client({ connectionString: url })
				await reader.connect()
				try {
					await reader.query("BEGIN")
					await reader.query("SELECT * FROM t")
					const started = Date.now()
					const ended = setTimeout(() => void reader.query("COMMIT"), 20_000)
					try {
						await expect(applyWithAtlas(options(dev, url))).rejects.toThrow("lock timeout")
					} finally {
						clearTimeout(ended)
					}
					expect(Date.now() - started).toBeLessThan(15_000)
				} finally {
					await reader.end()
				}
			}),
		)
	}, 60_000)

	it("checks a file after one that sets statement_timeout as apply runs it, on a session of its own", async () => {
		write(["SET statement_timeout = 50;\n", "SELECT pg_sleep(0.3);\n"])
		await withScratchDb((dev) =>
			withScratchDb(async (url) => {
				expect(await applyWithAtlas(options(dev, url, true))).toHaveLength(2)
				expect(await applyWithAtlas(options(dev, url))).toHaveLength(2)
			}),
		)
	}, 60_000)
})
