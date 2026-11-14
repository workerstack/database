/**
 * The drivers the vitest differential walks lists on: libsql in memory, and D1 local on Miniflare's workerd. Each
 * hands a case a fresh database with drizzle built by the case's version. bun:sqlite is the bun twin's own
 * (tests/bun/differential-lists.test.ts), since vitest cannot load it.
 */
import { Miniflare } from "miniflare"
import type { Db, Driver, Lib } from "./lists.ts"

/** libsql, a new in-memory database per open */
export const libsqlDriver: Driver = {
	name: "libsql",
	/* the client reads an INTEGER as a double; drizzle's buffer mode hands a REAL to Buffer.from */
	reads: { bigints: false, blobNumbers: false },
	async open(lib: Lib, relations?: object): Promise<Db> {
		const client = (lib.createClient as any)({ url: ":memory:" })
		return {
			all: async (sql) => (await client.execute(sql)).rows,
			close: async () => client.close(),
			orm: (lib.libsqlDrizzle as any)({ client, ...(relations && { relations }) }),
			run: async (...statements) => void (await client.batch(statements, "write")),
		}
	},
}

/* the most databases a case holds open at once: three shards; the truth opens alone */
const D1_BINDINGS = ["D0", "D1", "D2", "D3"]

/**
 * D1 local: one Miniflare for the whole run, its databases handed out and emptied on each open, since a Miniflare
 * takes about a second to start and a case opens up to three
 */
export async function d1Driver(): Promise<Driver & { dispose(): Promise<void> }> {
	const mf = new Miniflare({
		d1Databases: D1_BINDINGS,
		modules: true,
		script: "export default { fetch() { return new Response(null, { status: 204 }) } }",
	})
	const free: any[] = await Promise.all(D1_BINDINGS.map((binding) => mf.getD1Database(binding)))
	return {
		dispose: () => mf.dispose(),
		name: "d1",
		async open(lib: Lib, relations?: object): Promise<Db> {
			const database = free.shift()
			if (database === undefined) throw new Error(`a case opened more than ${D1_BINDINGS.length} D1 databases`)
			await database.batch([database.prepare("DROP TABLE IF EXISTS t"), database.prepare("DROP TABLE IF EXISTS m")])
			return {
				all: async (sql) => (await database.prepare(sql).all()).results,
				close: async () => void free.push(database),
				orm: (lib.d1Drizzle as any)(database, relations ? { relations } : {}),
				run: async (...statements) => void (await database.batch(statements.map((sql) => database.prepare(sql)))),
			}
		},
		/* D1 reads an INTEGER past 2^53 as the double nearest it, which database's own refusals answer; drizzle's buffer mode hands a REAL to Buffer.from */
		reads: { bigints: true, blobNumbers: false },
	}
}
