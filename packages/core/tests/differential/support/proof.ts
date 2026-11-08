/**
 * The D1 proof oracle: a case (proof-cases.ts) checked by one version of comb's CLI (`comb migrate check core
 * --local --yes` in a wrangler project whose local D1 holds the live schema), and the same file applied on D1
 * local, then read and written as an app does. The rule: check passes exactly the files D1 applies and that leave
 * every view readable and every table, and each view event an INSTEAD OF trigger makes writable, writable.
 */
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { Miniflare } from "miniflare"
import { unstable_splitSqlQuery } from "wrangler"
import { localD1Path } from "../../../src/migrate/core/d1-binding.ts"
import type { ProofCase } from "./proof-cases.ts"

/** A version's CLI, as its own `@workerstack/database/cli` exports it */
export type Cli = {
	runCli(
		argv: readonly string[],
		io: { cwd: string; err(line: string): void; out(line: string): void },
	): Promise<number>
}

/* the wrangler every version's check runs: the one comb tests against, linked into each project, as an app installs it */
const WRANGLER_PACKAGE = dirname(createRequire(import.meta.url).resolve("wrangler/package.json"))
const D1 = { binding: "CORE", database_id: "00000000-0000-0000-0000-000000000000", database_name: "core" }
const WRANGLER_TOML = `name = "differential"\ncompatibility_date = "2026-10-01"\n\n[[d1_databases]]\nbinding = "${D1.binding}"\ndatabase_name = "${D1.database_name}"\ndatabase_id = "${D1.database_id}"\nmigrations_dir = "atlas-migrations"\n`
export const FILE_NAME = "20260101000000_next.sql"

/**
 * A wrangler project for `c`, outside the repo so nothing above it resolves comb's own packages: wrangler linked
 * in, the pending file and its atlas.sum, and the local D1 wrangler keeps holding the live schema
 */
export function projectOf(c: ProofCase): { dir: string; remove(): void } {
	const dir = mkdtempSync(join(tmpdir(), "comb-differential-proof-"))
	mkdirSync(join(dir, "node_modules"))
	symlinkSync(WRANGLER_PACKAGE, join(dir, "node_modules", "wrangler"))
	writeFileSync(join(dir, "wrangler.toml"), WRANGLER_TOML)
	const migrations = join(dir, "atlas-migrations")
	mkdirSync(migrations)
	writeFileSync(join(migrations, FILE_NAME), c.file)
	const hashed = spawnSync("atlas", ["migrate", "hash", "--dir", `file://${migrations}`], { encoding: "utf8" })
	if (hashed.status !== 0) throw new Error(`atlas migrate hash failed: ${hashed.error?.message ?? hashed.stderr}`)
	const local = localD1Path(dir, D1)
	mkdirSync(dirname(local), { recursive: true })
	const db = new DatabaseSync(local)
	try {
		db.exec(c.base)
	} finally {
		db.close()
	}
	return { dir, remove: () => rmSync(dir, { force: true, recursive: true }) }
}

/** A copy of a project, so each version checks a local D1 no other version's wrangler holds open */
export function copyOf(dir: string): { dir: string; remove(): void } {
	const copy = mkdtempSync(join(tmpdir(), "comb-differential-proof-"))
	cpSync(dir, copy, { recursive: true, verbatimSymlinks: true })
	return { dir: copy, remove: () => rmSync(copy, { force: true, recursive: true }) }
}

/** What a version's check said: its exit code and the lines it wrote */
export type Check = { code: number; lines: string[] }

/** The version's `comb migrate check` of the project's pending file, approved */
export async function checkOf(cli: Cli, dir: string): Promise<Check> {
	const lines: string[] = []
	const io = { cwd: dir, err: (line: string) => void lines.push(line), out: (line: string) => void lines.push(line) }
	try {
		return { code: await cli.runCli(["migrate", "check", "core", "--local", "--yes"], io), lines }
	} catch (error) {
		return { code: -1, lines: [...lines, `threw: ${String(error)}`] }
	}
}

type Master = Map<string, { sql: string; table: string; type: string }>

/** What D1 did with the case: the file's own failure, or each read or write of the schema it left that failed */
export type Truth = {
	/** the probes that failed after the file, each with D1's error, and whether its object and its triggers are as before */
	broken: Array<{ error: string; probe: string; unchanged: boolean }>
	failed: string | undefined
}

type Database = {
	batch(statements: unknown[]): Promise<unknown>
	prepare(sql: string): { all(): Promise<{ results: Array<Record<string, unknown>> }> }
}

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`
const d1Error = (error: unknown): string => {
	const { cause, message } = error as Error
	return cause instanceof Error ? cause.message : message
}

async function masterOf(db: Database): Promise<Master> {
	const { results } = await db
		.prepare(
			"SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
		)
		.all()
	return new Map(
		results.map((row) => [
			String(row["name"]),
			{ sql: String(row["sql"]), table: String(row["tbl_name"]), type: String(row["type"]) },
		]),
	)
}

/* the events an INSTEAD OF trigger's text names, which make its view writable for them */
const INSTEAD = /\bINSTEAD\s+OF\s+(INSERT|UPDATE|DELETE)\b/i

/**
 * What an app does with the schema: reads every table and view, writes every table, and writes a view for each
 * event an INSTEAD OF trigger on it takes; each probe with the object it reads or writes
 */
async function probesOf(db: Database, master: Master): Promise<Array<{ object: string; sql: string }>> {
	const probes: Array<{ object: string; sql: string }> = []
	for (const [name, { type }] of master) {
		if (type !== "table" && type !== "view") continue
		/* a view over what is gone has no columns to read, and its read fails below */
		const columns = await db
			.prepare(`SELECT name FROM pragma_table_info('${name.replaceAll("'", "''")}')`)
			.all()
			.then(({ results }) => results.map((row) => String(row["name"])))
			.catch(() => [])
		const column = quote(columns.find((each) => each !== "id") ?? columns[0] ?? "id")
		const events =
			type === "table"
				? ["INSERT", "UPDATE", "DELETE"]
				: [...master.values()]
						.filter((each) => each.type === "trigger" && each.table === name)
						.map((each) => INSTEAD.exec(each.sql)?.[1]?.toUpperCase())
		probes.push({ object: name, sql: `SELECT * FROM ${quote(name)}` })
		if (events.includes("INSERT")) probes.push({ object: name, sql: `INSERT INTO ${quote(name)} DEFAULT VALUES` })
		if (events.includes("UPDATE")) probes.push({ object: name, sql: `UPDATE ${quote(name)} SET ${column} = ${column}` })
		if (events.includes("DELETE")) probes.push({ object: name, sql: `DELETE FROM ${quote(name)}` })
	}
	return probes
}

/** Each probe of the schema that fails, with D1's error */
async function failing(db: Database, master: Master): Promise<Array<{ error: string; object: string; probe: string }>> {
	const failed: Array<{ error: string; object: string; probe: string }> = []
	for (const { object, sql } of await probesOf(db, master)) {
		try {
			await db.batch([db.prepare(sql)])
		} catch (error) {
			failed.push({ error: d1Error(error), object, probe: sql })
		}
	}
	return failed
}

/** The SQL of `object` and of each trigger on it, which tells whether a file changed what a probe of it reads */
const shapeOf = (master: Master, object: string): string =>
	[...master]
		.filter(([name, { table }]) => name === object || table === object)
		.map(([name, { sql }]) => `${name}\0${sql}`)
		.toSorted()
		.join("\n")

/* the most databases a run holds open at once */
const BINDINGS = ["P0", "P1", "P2", "P3"]

/** D1 local for the truth: one Miniflare for the run, a database per case at a time, emptied before each */
export async function truthD1(): Promise<{ dispose(): Promise<void>; truthOf(c: ProofCase): Promise<Truth> }> {
	const mf = new Miniflare({
		d1Databases: BINDINGS,
		modules: true,
		script: "export default { fetch() { return new Response(null, { status: 204 }) } }",
	})
	const free = (await Promise.all(BINDINGS.map((binding) => mf.getD1Database(binding)))) as unknown as Database[]
	async function truthOf(c: ProofCase): Promise<Truth> {
		const db = free.shift()
		if (db === undefined) throw new Error(`more than ${BINDINGS.length} proof truths at once`)
		try {
			const left = await masterOf(db)
			const drops = [...left]
				.filter(([, { type }]) => type !== "index")
				.map(([name, { type }]) => `DROP ${type.toUpperCase()} IF EXISTS ${quote(name)}`)
			for (const sql of drops.toSorted(
				(a, b) => Number(b.startsWith("DROP TRIGGER")) - Number(a.startsWith("DROP TRIGGER")),
			))
				await db.batch([db.prepare(sql)])
			await db.batch(unstable_splitSqlQuery(c.base).map((sql) => db.prepare(sql)))
			const before = await masterOf(db)
			const already = await failing(db, before)
			if (already.length > 0)
				throw new Error(`the generator made a live schema an app cannot use: ${JSON.stringify(already)}\n${c.base}`)
			try {
				/* one batch, as wrangler's apply sends a file */
				await db.batch(unstable_splitSqlQuery(c.file).map((sql) => db.prepare(sql)))
			} catch (error) {
				return { broken: [], failed: d1Error(error) }
			}
			const after = await masterOf(db)
			const broken = (await failing(db, after)).map(({ error, object, probe }) => ({
				error,
				probe,
				unchanged: before.has(object) && shapeOf(before, object) === shapeOf(after, object),
			}))
			return { broken, failed: undefined }
		} finally {
			free.push(db)
		}
	}
	return { dispose: () => mf.dispose(), truthOf }
}
