/**
 * QL8: a page by number serves its rows and checks only the one its next cursor is minted from, as
 * 0.20.1 did; a page by cursor checks every row it serves, so a cursor walk answers the 500 on the
 * page that holds a row no cursor resumes after, whatever the page size (item 85). A derived list
 * and a merged list, which carry no key past the cap by reference, over a title one row of which is
 * 9000 characters, on libsql.
 */
import { getTableColumns } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { afterEach, describe, expect, it } from "vitest"
import { SEALED } from "../../../src/query/__fixtures__/cursor-secret.ts"
import { queryHelpers } from "../../../src/query/drizzle.ts"
import { paginateMerged } from "../../../src/query/merged.ts"
import { createListQuerySchema } from "../../../src/query/schema.ts"
import { applyListQuery, buildDerivedListQuery, buildListQuery } from "../../../src/query/sqlite/build-list-query.ts"
import { type LibsqlHarness, libsqlMemory } from "../support/libsql.ts"

const doc = sqliteTable("doc", { id: text("id").primaryKey(), rank: integer("rank"), title: text("title") })
const schema = createListQuerySchema({ pagination: { defaultLimit: 3, maxLimit: 3 }, sort: ["title"] })
/* 'L' sorts before every lowercase title: ascending a, b, c, d, e */
const TITLES: Array<[string, string]> = [
	["a", "L".repeat(9000)],
	["b", "b"],
	["c", "c"],
	["d", "d"],
	["e", "e"],
]

const harnesses: LibsqlHarness[] = []
afterEach(() => {
	for (const harness of harnesses.splice(0)) harness.close()
})

async function seeded(rows: Array<[string, string]>): Promise<LibsqlHarness> {
	const harness = libsqlMemory()
	harnesses.push(harness)
	await harness.client.execute("CREATE TABLE doc (id TEXT PRIMARY KEY, rank INTEGER, title TEXT)")
	for (const [id, title] of rows)
		await harness.client.execute({ args: [id, title], sql: "INSERT INTO doc (id, title) VALUES (?, ?)" })
	return harness
}

type Query = { cursor?: string | undefined; limit?: string; order: string; page?: string }
type Served = { hasMore: boolean; ids: string[]; nextCursor: string | null }

/** The rows with the extras a list asks for; `untitled` leaves the sort key out, a wiring mistake */
const select =
	(harness: LibsqlHarness, untitled = false) =>
	(extras: object) =>
		harness.db.select({ ...(untitled ? { id: doc.id, rank: doc.rank } : getTableColumns(doc)), ...extras }).from(doc)

/** One page of the derived list with no anchor, which reads no row to page a long title by reference */
async function derivedPage(query: Query, untitled = false): Promise<Served> {
	const harness = await seeded(TITLES)
	const parsed = schema.parse(query)
	const list = buildDerivedListQuery({ ...SEALED, idColumn: doc.id, parsed, sortColumns: { title: doc.title } })
	const [items, meta] = queryHelpers.paginate(await applyListQuery(select(harness, untitled), list), list)
	return { hasMore: meta.hasMore, ids: items.map((row) => row.id), nextCursor: meta.nextCursor }
}

/** One page of the merged list over two shards of the rows, which carries no key by reference */
async function mergedPage(query: Query, untitled = false): Promise<Served> {
	const shards = await Promise.all([0, 1].map(async (half) => await seeded(TITLES.filter((_, i) => i % 2 === half))))
	const parsed = schema.parse(query)
	const list = buildListQuery({ ...SEALED, merged: {}, parsed, table: doc })
	const reads = await Promise.all(shards.map(async (shard) => await applyListQuery(select(shard, untitled), list)))
	const [items, meta] = paginateMerged(reads, list)
	return { hasMore: meta.hasMore, ids: items.map((row) => row.id), nextCursor: meta.nextCursor }
}

/** The 500 a row no cursor resumes after answers, naming the key */
const refusesTitle = expect.objectContaining({ errorKey: "sort_not_wired", status: 500 })

describe.each([
	["a derived list", derivedPage],
	["a merged list", mergedPage],
] as const)("%s pages by number as 0.20.1 did (QL8)", (_, page) => {
	it("serves a page whose long title is no row its cursor is minted from", async () => {
		const served = await page({ order: "title.asc", page: "1" })
		expect(served).toEqual({ hasMore: true, ids: ["a", "b", "c"], nextCursor: expect.any(String) })
		/* the cursor minted from c resumes at d */
		expect((await page({ cursor: served.nextCursor ?? "", order: "title.asc" })).ids).toEqual(["d", "e"])
	})

	it("serves a last page holding the long title, minting no cursor", async () => {
		expect(await page({ order: "title.desc", page: "2" })).toEqual({
			hasMore: false,
			ids: ["b", "a"],
			nextCursor: null,
		})
	})

	/* the row's own value is what no cursor holds: the page serves it and says a next page by number exists */
	it("serves a page by number whose cursor would be minted from the long title, with no cursor and hasMore", async () => {
		expect(await page({ limit: "1", order: "title.asc", page: "1" })).toEqual({
			hasMore: true,
			ids: ["a"],
			nextCursor: null,
		})
		expect((await page({ limit: "1", order: "title.asc", page: "2" })).ids).toEqual(["b"])
	})

	/* a refusal of the list's wiring, not of a row's value, is loud on a page by number too */
	it("answers the 500 on a page by number whose rows lack the sort key the cursor is minted from", async () => {
		await expect(page({ order: "title.asc", page: "1" }, true)).rejects.toEqual(
			expect.objectContaining({ cause: expect.stringContaining("title"), errorKey: "sort_not_wired", status: 500 }),
		)
	})

	it("answers the 500 on the page by cursor that serves the long title, though no cursor is minted from it", async () => {
		const first = await page({ order: "title.desc" })
		expect(first.ids).toEqual(["e", "d", "c"])
		await expect(page({ cursor: first.nextCursor ?? "", order: "title.desc" })).rejects.toEqual(refusesTitle)
	})
})
