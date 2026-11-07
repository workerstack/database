/**
 * SL4 of r22: another process holding a local SQLite file's write lock, as the app that serves the
 * file or a second runner does. It runs on the runtime the test runs on, bun:sqlite under Bun and
 * node:sqlite under Node, so vitest and bun test spawn it alike. It opens with a 5 s busy timeout, as an
 * app writer should: comb's wait takes the file's shared lock between its retries, so the holder's COMMIT
 * can meet that read and would fail at once with SQLITE_BUSY without one, as against any reader.
 */
import { spawn } from "node:child_process"
import { generateMigrationHash } from "../../src/migrate/core/parse.ts"

const HOLDER = `const Database = typeof Bun === "undefined" ? require("node:sqlite").DatabaseSync : require("bun:sqlite").Database
const db = new Database(process.argv.at(-4))
db.exec("PRAGMA busy_timeout = 5000")
db.exec(\`BEGIN \${process.argv.at(-3)}\`)
db.exec(process.argv.at(-2))
console.log("locked")
setTimeout(() => { db.exec("COMMIT"); db.close() }, Number(process.argv.at(-1)))`

type Held = { done: Promise<number | null> }

/** A process holding the write lock on `file` for `ms`, having run `sql` under it; resolves once it holds it, with its exit */
export const holdLock = (file: string, sql: string, ms: number): Promise<Held> =>
	hold([file, "IMMEDIATE", sql, String(ms)])

/** A process holding `file`'s exclusive lock for `ms`, which keeps a reader out too, as a writer's commit does */
export const holdExclusive = (file: string, ms: number): Promise<Held> =>
	hold([file, "EXCLUSIVE", "SELECT 1", String(ms)])

async function hold(args: string[]): Promise<Held> {
	const holder = spawn(process.execPath, ["-e", HOLDER, ...args], {
		stdio: ["ignore", "pipe", "inherit"],
	})
	const done = new Promise<number | null>((resolve) => holder.once("exit", resolve))
	await new Promise<void>((resolve) => holder.stdout.once("data", () => resolve()))
	return { done }
}

/** 0001: the table, applied before the lock is taken */
export const TABLE = { "0001_t.sql": "CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER);\n" }

/** 0002: the file applied while another process holds the lock */
export const ADD = { "0002_add.sql": "ALTER TABLE t ADD COLUMN w INTEGER;\n" }

/** What the holder writes under its lock: an app's row */
export const APP_WRITE = "INSERT INTO t (v) VALUES (99)"

/** What the holder writes under its lock: `name` applied and recorded, as a second runner's apply does */
export function otherRun(name = "0002_add.sql", sql = ADD["0002_add.sql"]): string {
	return `${sql}INSERT INTO __drizzle_migrations (hash, created_at, name) VALUES ('${generateMigrationHash(sql)}', 1, '${name}')`
}

/** 0002 of a drizzle-made history's race: a seed, which running twice shows as two rows */
export const SEED = { "0002_seed.sql": "-- comb:allow-unsafe: seed\n\nINSERT INTO t (v) VALUES (5);\n" }

/** The history as drizzle's migrator makes it and comb's ALTER leaves it: `name` and `hash_v` with no UNIQUE */
export const DRIZZLE_HISTORY = `ALTER TABLE __drizzle_migrations RENAME TO comb_history;
CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric, name TEXT, hash_v INTEGER);
INSERT INTO __drizzle_migrations (id, hash, created_at, name, hash_v) SELECT id, hash, created_at, name, hash_v FROM comb_history;
DROP TABLE comb_history;`
