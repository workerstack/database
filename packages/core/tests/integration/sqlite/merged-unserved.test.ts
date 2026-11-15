/**
 * QL17 of r23: a merged list refused every page while any shard held a key of a class its mode
 * reads as another (a timestamp's TEXT, a boolean's 5), though the page served none such row. Each
 * shard's read of such a row carries its stored value, which the merge orders it by, as SQLite does;
 * the refusal comes on the page that serves the row, as on one database.
 */
import { createClient } from "@libsql/client"
import { getTableColumns } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { describe, expect, it } from "vitest"
import { SEALED } from "../../../src/query/__fixtures__/cursor-secret.ts"
import { paginateMerged } from "../../../src/query/merged.ts"
import { createListQuerySchema } from "../../../src/query/schema.ts"
import { applyListQuery, buildListQuery } from "../../../src/query/sqlite/build-list-query.ts"

const t = sqliteTable("t", {
	flag: integer("flag", { mode: "boolean" }),
	id: text("id").primaryKey(),
	ts: integer("ts", { mode: "timestamp" }),
})
const schema = createListQuerySchema({ pagination: { defaultLimit: 1, maxLimit: 3 }, sort: ["ts", "flag"] })

/** One merged page over shards seeded with `seeds`, its ids, hasMore and next cursor */
async function mergedPage(seeds: readonly string[], query: Record<string, string>) {
	const dbs = await Promise.all(
		seeds.map(async (seed) => {
			const client = createClient({ url: ":memory:" })
			await client.executeMultiple(`CREATE TABLE t (id TEXT PRIMARY KEY, ts INTEGER, flag INTEGER); ${seed}`)
			return drizzle({ client })
		}),
	)
	const list = buildListQuery({ ...SEALED, merged: {}, parsed: schema.parse(query), table: t })
	const reads = await Promise.all(
		dbs.map((db) => applyListQuery((extras) => db.select({ ...getTableColumns(t), ...extras }).from(t), list)),
	)
	const [items, meta] = paginateMerged(reads, list)
	return { hasMore: meta.hasMore, ids: items.map((row) => row.id), nextCursor: meta.nextCursor }
}

/** The ids a cursor walk of the merged list serves before it throws, and what it throws */
async function walkToRefusal(seeds: readonly string[], order: string) {
	const ids: string[] = []
	let cursor: string | undefined
	try {
		for (;;) {
			const page = await mergedPage(seeds, { order, ...(cursor === undefined ? {} : { cursor }) })
			ids.push(...page.ids)
			if (page.nextCursor === null) return { ids, thrown: undefined }
			cursor = page.nextCursor
		}
	} catch (thrown) {
		return { ids, thrown }
	}
}

const unread = (field: string, stored: string) => ({
	cause: expect.stringMatching(
		new RegExp(`^${field} stores a ${stored} value its column's drizzle mode reads as another`),
	),
	errorKey: "sort_not_wired",
	status: 500,
})

/* shard 2's z holds a TEXT, which SQLite orders after every number */
const TEXT_SHARDS = [
	"INSERT INTO t VALUES ('a', 1000, 0), ('c', 3000, 0)",
	"INSERT INTO t VALUES ('b', 2000, 0), ('z', '2024-01-01 00:00:00', 0)",
]

describe("a merged list over a key one shard holds in a class its mode reads as another (QL17 of r23)", () => {
	it("serves page 1 by cursor and by number where the TEXT row is past it, and mints its cursor", async () => {
		for (const by of [{}, { page: "1" }] as Array<Record<string, string>>) {
			const page = await mergedPage(TEXT_SHARDS, { order: "ts.asc", ...by })
			expect(page).toMatchObject({ hasMore: true, ids: ["a"] })
			expect(page.nextCursor).toEqual(expect.any(String))
		}
	})

	it("walks to the TEXT row in SQLite's order, then answers the 500 naming the key on the page that serves it", async () => {
		expect(await walkToRefusal(TEXT_SHARDS, "ts.asc")).toEqual({
			ids: ["a", "b", "c"],
			thrown: expect.objectContaining(unread("ts", "TEXT")),
		})
	})

	it("orders a boolean's 5 after every 1 and its -3 before every 0, as SQLite stores them", async () => {
		const own = "INSERT INTO t VALUES ('a', 1, 0), ('b', 1, 1)"
		expect(await walkToRefusal([own, "INSERT INTO t VALUES ('z', 1, 5), ('c', 1, 1)"], "ts.asc,flag.asc")).toEqual({
			ids: ["a", "b", "c"],
			thrown: expect.objectContaining(unread("flag", "INTEGER")),
		})
		/* ties on flag break by id in the first key's direction, ascending */
		expect(await walkToRefusal([own, "INSERT INTO t VALUES ('y', 1, -3), ('c', 1, 1)"], "ts.asc,flag.desc")).toEqual({
			ids: ["b", "c", "a"],
			thrown: expect.objectContaining(unread("flag", "INTEGER")),
		})
	})
})
