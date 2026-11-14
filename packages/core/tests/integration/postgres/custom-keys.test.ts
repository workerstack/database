/**
 * AB2 of area B on Postgres: a list sorted by a drizzle `customType` column minted a cursor the next
 * request answered `invalid_cursor`, a 400, as the fit check knew no `custom` family. The column here
 * is a domain over numeric its mapper reads as a JS number, and the four values agree past a double's
 * digits, so every one reads as 0.1: the list carries the key's text, as it does an expression over
 * numeric, and each path pages every row once, with the cursor's row kept or deleted before the next
 * page. Ids are out of key order.
 *
 * database-9d's round-two finding on AB2: a customType over text whose toDriver rewrites a numeric-looking
 * value (`12` stored as `sku-12`) carries no text, so its cursor holds the value as read, and AB2
 * bound a numeric-looking one past toDriver: ascending repeated one row forever, descending stopped
 * after one. Each path pages it every row once too. database-9d's ruling on the fix binds a carried text
 * as an untyped parameter, which Postgres types as the key it is compared with; postgres.js infers a
 * parameter's type itself, so both keys page on node-postgres and on postgres.js alike.
 *
 * B2-2 of area B: a mapper that reads an integer as a fraction (cents) was a 500 `sort_not_wired` on
 * the anchorless list and on an anchored list's joined key, which bind the key as read, as though the
 * driver had rounded it; no driver reads an integer type as a fraction.
 */
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js"
import { customType, numeric, type PgAsyncDatabase, type PgQueryResultHKT, pgTable, text } from "drizzle-orm/pg-core"
import type pg from "pg"
import type postgres from "postgres"
import { describe, expect, it } from "vitest"
import { queryHelpers } from "../../../src/query/drizzle.ts"
import { SEALED } from "../../../src/query/__fixtures__/cursor-secret.ts"
import { createListQuerySchema } from "../../../src/query/schema.ts"
import { buildDerivedListQuery, buildListQuery } from "../../../src/query/sqlite/build-list-query.ts"
import { usePg } from "../support/pg.ts"

/* a numeric domain the app reads as a JS number, the rounding QL3 carries the text for */
const amount = customType<{ data: number; driverData: string }>({
	dataType: () => "pg_temp.amount",
	fromDriver: (value) => Number(value),
	toDriver: (value) => value.toFixed(20),
})

/* a SKU the app reads bare and the column stores prefixed, where it looks like a number */
const sku = customType<{ data: string; driverData: string }>({
	dataType: () => "text",
	fromDriver: (value) => value.replace(/^sku-/, ""),
	toDriver: (value) => (/^\d+(?:\.\d+)?$/.test(value) ? `sku-${value}` : value),
})

/* an amount the database holds in cents and the app in units, so every value but a whole one reads as a fraction */
const cents = customType<{ data: number; driverData: number }>({
	dataType: () => "integer",
	fromDriver: (value) => value / 100,
	toDriver: (value) => Math.round(value * 100),
})

const item = pgTable("custom_item", {
	a: amount("a"),
	id: text("id").primaryKey(),
	n: numeric("n", { mode: "number" }),
	p: cents("p"),
	s: sku("s"),
})
/* the item's price again, for an anchored list sorted by a joined key */
const side = pgTable("custom_side", { item_id: text("item_id").primaryKey(), p: cents("p") })
const schema = createListQuerySchema({ pagination: { defaultLimit: 1, maxLimit: 1 }, sort: ["a", "n", "p", "s"] })
/* by `a`, `n` and `p`, and by `s`'s stored text: sku-12 < sku-3 < sku-45 < sku-7 */
const SERVED = {
	a: { asc: ["d", "a", "c", "b"], desc: ["b", "c", "a", "d"] },
	n: { asc: ["d", "a", "c", "b"], desc: ["b", "c", "a", "d"] },
	p: { asc: ["d", "a", "c", "b"], desc: ["b", "c", "a", "d"] },
	s: { asc: ["a", "c", "b", "d"], desc: ["d", "b", "c", "a"] },
} as const
type Key = keyof typeof SERVED
/* `joined` is a list anchored on custom_item, sorted by custom_side's column */
type Path = "anchored" | "anchorless" | "joined" | "table"
/** One session, on node-postgres or on postgres.js, its statements run as given */
type Session = { db: PgAsyncDatabase<PgQueryResultHKT>; run(statement: string, params?: unknown[]): Promise<unknown[]> }

/** `client` as a Session */
const onPg = (client: pg.Client): Session => ({
	db: drizzle({ client }),
	run: async (statement, params) => (await client.query(statement, params)).rows,
})

/** `sql` as a Session, its one connection holding the TEMP tables */
const onPostgresJs = (sql: postgres.Sql): Session => ({
	db: drizzlePostgres({ client: sql }),
	run: async (statement, params) => [...(await sql.unsafe(statement, params as never[]))],
})

/** The session's domain and table, holding the four rows afresh */
async function seed(session: Session): Promise<void> {
	const [made] = (await session.run("SELECT to_regclass('pg_temp.custom_item') AS t")) as { t: unknown }[]
	if (made?.t === null) {
		await session.run("CREATE DOMAIN pg_temp.amount AS numeric")
		await session.run(
			"CREATE TEMP TABLE custom_item (id text PRIMARY KEY, a pg_temp.amount, n numeric, p integer, s text)",
		)
		await session.run("CREATE TEMP TABLE custom_side (item_id text PRIMARY KEY, p integer)")
	}
	await session.run("DELETE FROM custom_item")
	await session.run("DELETE FROM custom_side")
	await session.run(`
	INSERT INTO custom_item VALUES ('d', 0.1000000000000000001, 0.5, 150, 'sku-7'), ('a', 0.1000000000000000002, 1.5, 200, 'sku-12'),
		('c', 0.1000000000000000003, 2.5, 1234, 'sku-3'), ('b', 0.1000000000000000004, 3.5, 2500, 'sku-45')`)
	await session.run("INSERT INTO custom_side SELECT id, p FROM custom_item")
}

/** The list `path` builds for `query` */
function listOf(path: Path, query: ReturnType<typeof schema.parse>) {
	if (path === "table") return buildListQuery({ ...SEALED, parsed: query, table: item as never })
	const anchor = path === "anchorless" ? { idColumn: item.id } : { anchor: { idColumn: item.id, table: item } }
	return buildDerivedListQuery({
		...SEALED,
		...anchor,
		parsed: query,
		sortColumns: { a: item.a, n: item.n, p: path === "joined" ? side.p : item.p, s: item.s },
	})
}

/** Every id `path` serves by `key`, one a page, by cursor from `from` (its row `gone` deleted first), deleting each page's rows when `deleting` */
async function served(
	session: Session,
	path: Path,
	{
		deleting,
		direction,
		from,
		gone,
		key,
	}: { deleting: boolean; direction: "asc" | "desc"; from?: string | undefined; gone?: string | undefined; key: Key },
) {
	await seed(session)
	if (gone !== undefined) await session.run("DELETE FROM custom_item WHERE id = $1", [gone])
	const ids: string[] = []
	let cursor: string | undefined = from
	for (let n = 1; n <= 8; n++) {
		const query = { ...schema.parse({ order: `${key}.${direction}` }), cursor }
		const built = listOf(path, query)
		const select = session.db
			.select({ a: item.a, id: item.id, n: item.n, p: item.p, s: item.s, ...built.extras })
			.from(item)
			.innerJoin(side, eq(side.item_id, item.id))
			.$dynamic()
		const rows = await (built.where === undefined ? select : select.where(built.where))
			.orderBy(...built.orderBy)
			.limit(built.limit)
		const [items, meta] = queryHelpers.paginate(rows, built)
		const page = items.map((row) => row["id"] as string)
		ids.push(...page)
		if (deleting) for (const id of page) await session.run("DELETE FROM custom_item WHERE id = $1", [id])
		if (meta.nextCursor === null) return ids
		cursor = meta.nextCursor
	}
	return ids
}

describe("a customType key pages or is refused at the mint, on Postgres (AB2 of area B; sibling: QL5's bytea)", () => {
	const sessions = usePg()

	const DRIVERS = { "node-postgres": () => onPg(sessions.pg()), "postgres.js": () => onPostgresJs(sessions.sql()) }
	const CASES = (["table", "anchored", "anchorless"] as const).flatMap((path) =>
		(["node-postgres", "postgres.js"] as const).map((driver) => [path, driver] as const),
	)

	it.each(CASES)(
		"pages a customType key over a numeric domain on the %s list every row once on %s, its cursor row there or deleted",
		async (path, driver) => {
			for (const deleting of [false, true])
				for (const direction of ["asc", "desc"] as const)
					expect(
						await served(DRIVERS[driver](), path, { deleting, direction, key: "a" }),
						`${direction} ${deleting}`,
					).toEqual(SERVED.a[direction])
		},
	)

	/* B2-2 of area B: no driver reads an integer as a fraction, so one there is the mapper's, bound back through toDriver */
	it.each([...CASES, ["joined", "node-postgres"] as const, ["joined", "postgres.js"] as const])(
		"pages a customType key that reads an integer in cents on the %s list every row once on %s",
		async (path, driver) => {
			for (const deleting of [false, true])
				for (const direction of ["asc", "desc"] as const)
					expect(
						await served(DRIVERS[driver](), path, { deleting, direction, key: "p" }),
						`${direction} ${deleting}`,
					).toEqual(SERVED.p[direction])
		},
	)

	/* database-9d's round-two finding on AB2: a numeric-looking value was bound past toDriver */
	it.each(CASES)(
		"pages a customType key over text whose toDriver rewrites a numeric-looking value on the %s list every row once on %s",
		async (path, driver) => {
			for (const deleting of [false, true])
				for (const direction of ["asc", "desc"] as const)
					expect(
						await served(DRIVERS[driver](), path, { deleting, direction, key: "s" }),
						`${direction} ${deleting}`,
					).toEqual(SERVED.s[direction])
		},
	)
})

/*
 * database-9d's AB2 ruling: a cursor without the carried flag holds every value as read, as every cursor a
 * released database minted does; refused, every client mid-list would be a 400 at the upgrade. These are
 * the page-1 cursors database 0.20.1, from its npm tarball, minted for the table list here, sealed under
 * SEALED (.tmp/grunt/p21/oracle/ab2r-mint.ts).
 */
const MINTED_0_20_1: Record<`${"n" | "s"}.${"asc" | "desc"}`, string> = {
	"n.asc":
		"AfwVc0cG3FSEFjc9-x9e5_qqrqLvgN3a4KwfFHYMzD-yo7Y7SzGbT2c7jguG7gWLfs_3XP68xCXkKPnfDPJCSAZ0cCw5Y5atQuyzvQ3fz0sM24HNxQZkRqxPoS8xbbEzAl_Qnyzxk1GL9uNwDCx1ByxxioSZauXMH_WYOFNgVpt0zKNDDjBMrhoWYaHBQyode_ceFwR5ENajkCiITxZMr917vH_bsnpjyxa16KOpG-dpedQC60ZQK6VYEhgf8Ojr2lcn4fuzB-yR5Ywu-gz-TTQ79WAk5Pj-thE9BS7DUQt11pz8x7lwTm4mgWScLKmcD6Y_vu6cPameaRWJMidYtjPCi9DWZuqfpgYqRqetKz7UISUBhPi4Vjj3tOFyBC9FtLZyvDeUqsno",
	"n.desc":
		"AQymqwxxeOXuYJ61YBNnS6EE6GnzQaM_5nEJJ9GPaeX-GmaECSZEyQFvGffBJhPMFRf3AUKyfBNqGZHpXsrwRTLiZHjxvToTPLL4zp1kSVZOyKtuoceT2W7rxjHozcyd4FuH5ayo3K6iejrVexpkvhMOHcEy4NTGr482TKdwKWjyLmj7-nbG2gPn8ecpYD7kFmDUDCurTqdSfQ8JfkqrAiDWh_Pc9JZ5HSRFWyYlgn7sIoUtsNdJlWhyrJksDQBQbE0l-CrZXVQY98IiEHI-EqPGVTQ9a5AX1IKBofRXuHJY-BKvobUHOtow1_TqNWjbBbQE0jBLVZSJf4D1t-txrZxDuK0mBEPsAdUXxJCDdUoGVPHDD5NdkzJCOSa62cJsAjn_q3Vct5el",
	"s.asc":
		"AesJGSUXN2Au7dCvcPQGl5MYWxhGpxeCdeWtyKrfRYOvZlv8Qb00qNMTZ6XCuRxt4o_Uodls1-fveq1sV-02wYcgID2Fj1zNRTbJeCnyvOtGKwG1J3-FSiM4hkvQcuu9c8uPUSnEqi-qCFi76pfLkXaW096wSasd0FQDH0t3rFeNFCiv9teMTYO9lo704GRy0B12Hp-NidhAX1Z52ZkK_tLsYrzQZ1_3LZ-1lGd2mfFu2AhkUq1xsKrDynDfwdEDidBbdArw-1TiXhvRjI-rtd6UtHguMpum0J_ZUvcW0ttiZD9JwpsQfPnEGBo02ea7KO3BkX29bEqYtz-lU2TMoR45xN-OqCo2chCvEmvj4XzqPSa7GkPYSkf8EGtV5J0Q53ihcQFqBeyh",
	"s.desc":
		"AeqH1VpTXVmTVIawD8WqAVe1-jSBWt06ybkc1TLMe2WNzUVT1yHxDYc2DJygqrMgD_c1jb1OEGFv5NYXFn3nwUGtdMG9l42n0W77AUH7Rz9HteVxVAdExjjFZuFHqLYuvVzTY4twwX73pjLSCKAQwe4rVbSapwkYW3YwyvmBCkLUKrofequNVxAMTane86saxN2jTZem70ZFYhWFENohS01Ju0wB52INtC15TArZZOPwfcByGJFAEUI-Jc2kxJ1gAhAPatFbaaXvKs4BevMzuPqS2IzjIMoVV0ROqmQ7eYcwaODr1umLGH8kNc65IJ4hV7MXw8yIWKINpD_w65tGyeQwhg37APDnCHOZpLYjvj2pUziAYr8nDW2qqQzCDvo4LZWNY_G_RjVk",
}

describe("a cursor database 0.20.1 minted pages on after the upgrade (database-9d's AB2 ruling; sibling: the flagged cursor above)", () => {
	const sessions = usePg()

	it.each(["n", "s"] as const)(
		"pages the rest of the %s list from 0.20.1's page-1 cursor, its row there or deleted",
		async (key) => {
			for (const deleting of [false, true])
				for (const direction of ["asc", "desc"] as const) {
					const from = MINTED_0_20_1[`${key}.${direction}`]
					const gone = deleting ? SERVED[key][direction][0] : undefined
					expect(
						await served(onPg(sessions.pg()), "table", { deleting, direction, from, gone, key }),
						`${direction} ${deleting}`,
					).toEqual(SERVED[key][direction].slice(1))
				}
		},
	)
})
