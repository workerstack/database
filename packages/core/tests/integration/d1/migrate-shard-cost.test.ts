/**
 * SD3 of r23: anyrow's shard has a table named `table`, which every DDL file spells as the keyword TABLE, so
 * 0.21.0's proof took it for a name every file touches and every live table for its FK child, and copied the whole
 * database for a file that creates one table: on prod shard-0 (3,741 tables) a check took 43 to 47 s against 3.6 s
 * on core. This holds the cost: a check of one pending file on a shard like that takes no more than twice a check on
 * core, the median of 5 each, on the same machine, through the real wrangler --local.
 *
 * What limits a check on either is the same work, four processes started one after another: three of wrangler's
 * `d1 execute` reads of the database, each booting miniflare, and the proof's child booting miniflare and running
 * the file once (0.7 to 0.8 s each, about 3 s of a 3.2 s check on the machine this was measured on). Once the copy
 * holds only what the file names, the shard adds only its larger schema crossing those reads and database scoping it.
 */
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterAll, describe, expect, it } from "vitest"
import { runCli } from "../../../src/cli/index.ts"
import { localD1Path } from "../../../src/migrate/core/d1-binding.ts"
import { d1Io, d1Project, writeMigrations } from "../support/d1-project.ts"

const FIXTURE = path.join(import.meta.dirname, "__fixtures__/anyrow-shard")
const ENTRY = { binding: "CORE", database_id: "00000000-0000-0000-0000-000000000000", database_name: "core" }

/** The tables prod shard-0 holds beyond its migrations' (runtime-created, two indexes and a few rows each) */
const RUNTIME_TABLES = 3_700

const dirs: string[] = []
afterAll(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

/** The `.sql` files of fixture `kind`, by name */
function migrationsOf(kind: "core" | "shard"): Record<string, string> {
	const dir = path.join(FIXTURE, kind)
	return Object.fromEntries(
		fs
			.readdirSync(dir)
			.filter((name) => name.endsWith(".sql"))
			.map((name) => [name, fs.readFileSync(path.join(dir, name), "utf8")]),
	)
}

/** A project on a local D1 with fixture `kind` applied, and, for a shard, the runtime tables beside them */
async function applied(kind: "core" | "shard"): Promise<string> {
	const dir = d1Project(migrationsOf(kind))
	dirs.push(dir)
	const apply = d1Io(dir)
	expect(await runCli(["migrate", "apply", "core", "--local"], apply), apply.errors.join("\n")).toBe(0)
	if (kind === "shard") {
		const db = new DatabaseSync(localD1Path(dir, ENTRY))
		db.exec("BEGIN")
		for (let at = 0; at < RUNTIME_TABLES; at++) {
			db.exec(
				`CREATE TABLE \`rt_${at}\` (\`id\` text PRIMARY KEY NOT NULL, \`name\` text, \`owner\` text);
CREATE INDEX \`rt_${at}_name\` ON \`rt_${at}\` (\`name\`);
INSERT INTO \`rt_${at}\` VALUES ('a', 'x', 'o'), ('b', 'y', 'o'), ('c', 'z', 'o');`,
			)
		}
		db.exec("COMMIT")
		db.close()
	}
	return dir
}

/** The seconds one `migrate check` of the pending file takes in `dir`, which must exit 0 */
async function checked(dir: string): Promise<number> {
	const io = d1Io(dir)
	const started = performance.now()
	expect(await runCli(["migrate", "check", "core", "--local", "--yes"], io), io.errors.join("\n")).toBe(0)
	return (performance.now() - started) / 1000
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number

describe("a D1 check of one pending file on a shard like anyrow's costs what core's does (SD3 of r23)", () => {
	it("takes no more than twice core's, the median of 5 each", async () => {
		const [core, shard] = [await applied("core"), await applied("shard")]
		const probe = { "20261101000000_probe.sql": "CREATE TABLE `r23_probe` (`id` text PRIMARY KEY NOT NULL);\n" }
		for (const dir of [core, shard]) writeMigrations(dir, probe)
		const [coreRuns, shardRuns]: number[][] = [[], []]
		/* interleaved, so a loaded machine slows both alike */
		for (let run = 0; run < 5; run++) {
			coreRuns.push(await checked(core))
			shardRuns.push(await checked(shard))
		}
		expect(
			median(shardRuns),
			`core ${JSON.stringify(coreRuns)}, shard ${JSON.stringify(shardRuns)}`,
		).toBeLessThanOrEqual(2 * median(coreRuns))
	}, 900_000)
})
