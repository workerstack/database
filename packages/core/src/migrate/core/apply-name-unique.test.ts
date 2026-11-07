import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it, vi } from "vitest"
import { libsqlConnection } from "../__fixtures__/libsql-connection.ts"
import { createBunSqliteProvider } from "../drivers/bun-sqlite.ts"
import { openLibsqlFile } from "../drivers/libsql-file.ts"
import { applyRecorded, ensureMigrationsTable } from "./apply.ts"

vi.mock("bun:sqlite", () => import("../__fixtures__/bun-sqlite-node.ts"))

const file = (filename: string, sql: string) => ({ filename, hash: filename, statements: [sql] })

/*
 * SL2 of r23: drizzle-orm's SQLite migrator makes __drizzle_migrations without a UNIQUE name, and comb adds
 * `name` by ALTER, so a run whose batch began after another run committed the same file recorded and ran it twice
 */
const DRIZZLE_TABLE =
	"CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric, name TEXT, hash_v INTEGER)"
const SEED = file("0002_seed.sql", "INSERT INTO t VALUES (5)")

/** A database file holding table t and a history the way drizzle's migrator makes it and comb's ALTER leaves it */
function drizzleHistory(): { file: string; remove(): void } {
	const dir = mkdtempSync(path.join(tmpdir(), "comb-apply-drizzle-"))
	const db = path.join(dir, "core.db")
	const raw = new DatabaseSync(db)
	raw.exec(`CREATE TABLE t (v INTEGER); ${DRIZZLE_TABLE}`)
	raw.close()
	return { file: db, remove: () => rmSync(dir, { force: true, recursive: true }) }
}

/** The rows of t and the records of 0002_seed.sql in the database at `db` */
function seeded(db: string): { records: number; rows: number } {
	const raw = new DatabaseSync(db)
	try {
		const count = (sql: string) => Number((raw.prepare(sql).get() as { n: number }).n)
		return {
			records: count("SELECT count(*) AS n FROM __drizzle_migrations WHERE name = '0002_seed.sql'"),
			rows: count("SELECT count(*) AS n FROM t WHERE v = 5"),
		}
	} finally {
		raw.close()
	}
}

const BUN_FILE = (db: string) => ({
	migrationsDir: "m",
	name: "local",
	provider: { path: db, type: "bun-sqlite" as const },
})

describe("applyRecorded on a history drizzle's migrator made (SL2 of r23)", () => {
	it.each([
		["a libsql file", (db: string) => openLibsqlFile(db)],
		["bun:sqlite", (db: string) => createBunSqliteProvider({ path: db, type: "bun-sqlite" }).connect(BUN_FILE(db))],
	])("runs a file once when a run committed it before this run's batch began, on %s", async (_, open) => {
		const made = drizzleHistory()
		try {
			const history = await createBunSqliteProvider({ path: made.file, type: "bun-sqlite" }).connect(
				BUN_FILE(made.file),
			)
			await ensureMigrationsTable(history)
			const first = await open(made.file)
			expect(await applyRecorded(first, SEED, { history })).toBe("this run")
			await first.close()
			const second = await open(made.file)
			expect(await applyRecorded(second, SEED, { history })).toBe("another run")
			await second.close()
			await history.close()
			expect(seeded(made.file)).toEqual({ records: 1, rows: 1 })
		} finally {
			made.remove()
		}
	})
})

/** The unique indexes of the history in the database at `db`, each by its columns */
function uniqueIndexes(db: string): string[][] {
	const raw = new DatabaseSync(db)
	try {
		return raw
			.prepare("SELECT name FROM pragma_index_list('__drizzle_migrations') WHERE \"unique\" = 1")
			.all()
			.map((index) =>
				raw
					.prepare(`SELECT name FROM pragma_index_info('${String((index as { name: string }).name)}')`)
					.all()
					.map((column) => String((column as { name: string }).name)),
			)
			.toSorted()
	} finally {
		raw.close()
	}
}

describe("ensureMigrationsTable keeps a name unique (SL2 of r23)", () => {
	it("gives a drizzle-made history a unique index on name, once", async () => {
		const made = drizzleHistory()
		try {
			const conn = await createBunSqliteProvider({ path: made.file, type: "bun-sqlite" }).connect(BUN_FILE(made.file))
			await ensureMigrationsTable(conn)
			await ensureMigrationsTable(conn)
			await conn.close()
			expect(uniqueIndexes(made.file)).toEqual([["id"], ["name"]])
		} finally {
			made.remove()
		}
	})

	it("leaves a history that already keeps its name unique with the index it has", async () => {
		const conn = libsqlConnection()
		await ensureMigrationsTable(conn)
		await ensureMigrationsTable(conn)
		const names = (await conn.execute("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")).rows
		expect(names).toEqual([["sqlite_autoindex___drizzle_migrations_1"]])
	})

	it("refuses a history holding one file twice, naming it, and changes nothing", async () => {
		const made = drizzleHistory()
		try {
			const raw = new DatabaseSync(made.file)
			raw.exec(
				"INSERT INTO __drizzle_migrations (hash, created_at, name) VALUES ('a', 1, '0002_seed.sql'), ('b', 2, '0002_seed.sql'), ('c', 3, '0003_x.sql'), ('d', 4, '0003_x.sql'), ('e', 5, '0004_ok.sql')",
			)
			raw.close()
			const conn = await createBunSqliteProvider({ path: made.file, type: "bun-sqlite" }).connect(BUN_FILE(made.file))
			await expect(ensureMigrationsTable(conn)).rejects.toThrow(
				"__drizzle_migrations records 0002_seed.sql, 0003_x.sql more than once, so comb cannot keep a file from being recorded twice: delete the extra rows of each (keep the first), then run it again",
			)
			await conn.close()
			expect(uniqueIndexes(made.file)).toEqual([["id"]])
		} finally {
			made.remove()
		}
	})
})
