/**
 * Round four of area B on D1: a key column holding what its drizzle mode does not read back as stored
 * pages every row once on a list that reads the key back, and answers a 500 naming the key on one
 * that binds it as read, on the page that serves the row, never a 400, a repeat, a skip or a loop
 * (support/stored-keys.ts). tests/integration/sqlite and tests/bun run the same on libsql and bun:sqlite.
 */
import { drizzle } from "drizzle-orm/d1"
import { afterEach, describe, expect, it } from "vitest"
import { type D1Harness, d1Memory } from "../support/d1.ts"
import {
	HELD_REALS,
	HELD_UNPRINTED,
	INTEGER_TEXT,
	JSON_OBJECT,
	JSON_TEXT,
	LONG_BETWEEN,
	type OpenDb,
	REAL_TEXT,
	refusedOnPage,
	STORED_CLASSES,
	storedProblems,
	TEXT_BLOB,
	UNTYPED_TEXT,
} from "../support/stored-keys.ts"
import { HELD_BESIDE_DIGITS, HELD_WIDE_BESIDE_DIGITS } from "../support/held-beside-digits.ts"

const shards: D1Harness[] = []
afterEach(async () => {
	await Promise.all(shards.splice(0).map((shard) => shard.dispose()))
})

const open: OpenDb = async (statements, relations) => {
	const shard = await d1Memory()
	shards.push(shard)
	for (const statement of statements) await shard.CORE.prepare(statement).run()
	return drizzle(shard.CORE, { relations: relations as never }) as never
}

describe("a cursor the list minted is never refused as invalid_cursor (AB4-1 of area B)", () => {
	it("answers a JSON-mode key the 500 naming it on every list kind, never a 400", async () => {
		expect(await storedProblems(open, JSON_TEXT, { limits: [1, 2], refusing: () => true })).toEqual([])
	})

	it.each([
		["REAL", REAL_TEXT],
		["INTEGER", INTEGER_TEXT],
		["untyped", UNTYPED_TEXT],
	] as const)("pages a %s key holding TEXT, never a 400", async (_, kase) => {
		expect(await storedProblems(open, kase)).toEqual([])
	})

	/* AB4-2 of area B: a BLOB is outside what a text column reads back as stored, so a list reading it back carries it */
	it("pages a TEXT key holding a BLOB, or refuses it by name on a list that binds it as read, never a 400", async () => {
		expect(await storedProblems(open, TEXT_BLOB)).toEqual([])
	})
})

describe("a stored class a key's mode reads apart pages or is refused by name (AB4-2 of area B)", () => {
	it.each(Object.entries(STORED_CLASSES))("%s", async (_, kase) => {
		expect(await storedProblems(open, kase)).toEqual([])
	})
})

describe("a row no cursor holds is refused on the page by cursor that serves it, at any page size (AB4-3 of area B; QL8)", () => {
	it("answers the 500 on the last page, by cursor, that serves a key past the cap, though no cursor is minted from it (QL8)", async () => {
		expect(await refusedOnPage(open, LONG_BETWEEN, { direction: "asc", kind: "anchorless", limit: 2 })).toEqual({
			error: "sort_not_wired",
			ids: ["r0", "r2"],
			page: 2,
		})
	})

	/* QL8: a page by number serves a JSON row, and mints no cursor from one, its hasMore still true */
	it("serves a JSON object on a table list's pages by number, minting no cursor from a JSON row", async () => {
		expect(await refusedOnPage(open, JSON_OBJECT, { direction: "desc", kind: "table", limit: 3 })).toEqual({
			ids: ["r1", "r2", "r0"],
			page: 1,
		})
		expect(await refusedOnPage(open, JSON_OBJECT, { direction: "desc", kind: "table", limit: 2 })).toEqual({
			ids: ["r1", "r2"],
			page: 1,
			stranded: true,
		})
	})

	/* the timestamp BLOB libsql reads as an Invalid Date this driver reads as Date(1): AB4-2's timestamp_ms dataset holds it */
})

describe("a REAL a key's mode reads apart pages exactly where a text of it reads back, on D1 (AB4-7 of area B)", () => {
	it.each(Object.entries(HELD_REALS))("%s", async (_, kase) => {
		expect(await storedProblems(open, kase)).toEqual([])
	})

	/* ascending, the page by cursor that serves it refuses it; descending it is page 1's row, by number,
	   which serves it and mints no cursor from it while hasMore holds (QL8) */
	it.each(["table", "anchored", "listOptions"] as const)(
		"answers the %s list a 500 naming the key on the page by cursor that serves a REAL no text reads back as",
		async (kind) => {
			expect(await refusedOnPage(open, HELD_UNPRINTED, { direction: "asc", kind, limit: 1 })).toEqual({
				error: "sort_not_wired",
				ids: ["r0", "r2"],
				page: 3,
			})
			expect(await refusedOnPage(open, HELD_UNPRINTED, { direction: "desc", kind, limit: 1 })).toEqual({
				ids: ["r1"],
				page: 1,
				stranded: true,
			})
		},
	)
})

/* QL2: a value held apart binds with no affinity, so a numeric-looking TEXT beside it compares as stored */
describe("a held value beside a numeric-looking TEXT pages every row once, on D1 (QL2)", () => {
	it.each(
		Object.entries({
			...HELD_BESIDE_DIGITS,
			"text() holding an integer past 2^53 beside '10'": HELD_WIDE_BESIDE_DIGITS,
		}),
	)("%s", async (_, kase) => {
		expect(await storedProblems(open, kase)).toEqual([])
	})
})
