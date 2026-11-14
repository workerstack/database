/**
 * The generator of list cases: a SQLite table whose key columns mix storage classes (numeric-looking TEXT, NULLs,
 * integers past 2^53, REAL ±0, ±Infinity and values near the edge of a double, BLOBs, odd and very long text),
 * and a list over it: its path through database, one or two sort keys with their directions and NULL placement, a
 * limit, a filter, a `select`, and a walk by cursor (deleting what each page served, or not) or by page number.
 * A case is plain data, its columns named by kind, so every version builds it with its own drizzle (lists.ts).
 */
import type { Random } from "./random.ts"

/** How a key column is declared to SQLite and to drizzle, and the SQL literals its rows draw from */
export type KeyKind = {
	/** the column's type in CREATE TABLE: "" declares none, so the column has no affinity */
	ddl: string
	/** the drizzle column, by builder and mode, that lists.ts builds with a version's drizzle */
	drizzle: Column
	name: string
	values: readonly string[]
}
export type Column =
	| { builder: "blob"; mode: "bigint" | "buffer" }
	| { builder: "cents" | "folded" | "numeric" | "real" | "text" }
	| { builder: "integer"; mode?: "boolean" | "timestamp" | "timestamp_ms" }
	| { builder: "numeric"; mode: "number" }

/* a title whose cursor is past any cap, which a list reads no row to page by reference for (QL8) */
export const LONG_TEXT = `'${"L".repeat(9000)}'`
const WORDS = ["'a'", "'a,b'", "'b, c'", "''", "'Z'", "'a,'", "','", "'é'", "'10'", "'9'", "'a b'"]

export const KINDS: readonly KeyKind[] = [
	{ ddl: "INTEGER", drizzle: { builder: "integer" }, name: "integer", values: ["-2", "-1", "0", "1", "2"] },
	{
		ddl: "REAL",
		drizzle: { builder: "real" },
		name: "real",
		values: ["0.1", "0.30000000000000004", "1e308", "-0.0", "0.0", "9e999", "-9e999", "2", "2.5", "1e-310"],
	},
	{
		ddl: "NUMERIC",
		drizzle: { builder: "numeric" },
		name: "numeric",
		values: ["1.5", "10", "2", "'x'", "0.1", "9e999", "x'01'"],
	},
	{
		ddl: "NUMERIC",
		drizzle: { builder: "numeric", mode: "number" },
		name: "numeric-number",
		values: ["1.5", "10", "2", "0.1", "'x'"],
	},
	{ ddl: "TEXT", drizzle: { builder: "text" }, name: "text", values: WORDS },
	{ ddl: "TEXT", drizzle: { builder: "text" }, name: "title", values: ["'a'", "'b'", "'c'", "'d'", LONG_TEXT] },
	{
		ddl: "",
		drizzle: { builder: "text" },
		name: "text-mixed",
		values: ["'a'", "'10'", "10", "2.5", "x'00ff'", "'b'", "-1", "9e999"],
	},
	/* QL2's shapes: a value held apart beside a TEXT that reads as a number, in a column of no affinity or BLOB's */
	{
		ddl: "",
		drizzle: { builder: "text" },
		name: "text-held",
		values: ["'10'", "9e999", "-9e999", "50.5", "9007199254740993", "'a'", "'9'"],
	},
	{
		ddl: "BLOB",
		drizzle: { builder: "blob", mode: "buffer" },
		name: "blob-held",
		values: ["x'01'", "50.5", "'10'", "9e999", "'2'"],
	},
	{
		ddl: "",
		drizzle: { builder: "integer" },
		name: "int-mixed",
		values: ["1", "2", "'x'", "'1'", "2.5", "x'01'", "'10'"],
	},
	{ ddl: "", drizzle: { builder: "real" }, name: "real-mixed", values: ["1", "0.5", "'x'", "'0.5'", "x'02'"] },
	{ ddl: "TEXT", drizzle: { builder: "folded" }, name: "custom-text", values: WORDS },
	{
		ddl: "INTEGER",
		drizzle: { builder: "cents" },
		name: "custom-cents",
		values: ["1234", "1250", "1200", "-5", "0", "99999"],
	},
	{
		ddl: "INTEGER",
		drizzle: { builder: "integer", mode: "timestamp" },
		name: "time-seconds",
		values: ["1000", "1000.0001", "1001", "999.9999", "1000.5", "9e999", "-9e999"],
	},
	{
		ddl: "INTEGER",
		drizzle: { builder: "integer", mode: "timestamp_ms" },
		name: "time-ms",
		values: ["1000", "1000.25", "1001", "999", "1000.5"],
	},
	{
		ddl: "INTEGER",
		drizzle: { builder: "integer", mode: "timestamp" },
		name: "time-seconds-text",
		values: ["1000", "1001", "'1970-01-01T00:00:01Z'", "'2024-01-01 12:00:00'", "'a-text'", "'1500'", "x'00'"],
	},
	{
		ddl: "BLOB",
		drizzle: { builder: "blob", mode: "buffer" },
		name: "blob",
		values: ["x''", "x'00'", "x'0001'", "x'ff'", "x'01'", "'t'"],
	},
	{
		ddl: "BLOB",
		drizzle: { builder: "blob", mode: "bigint" },
		name: "blob-bigint",
		values: ["x'3132'", "x'39303037313939323534373430393933'", "x'2d33'", "x'30'"],
	},
	{
		ddl: "INTEGER",
		drizzle: { builder: "integer", mode: "boolean" },
		name: "boolean",
		values: ["0", "1", "2", "'t'", "0.5"],
	},
	{
		ddl: "INTEGER",
		drizzle: { builder: "integer" },
		name: "bigint-int",
		values: ["9007199254740993", "9007199254740992", "1", "-9007199254740993"],
	},
]

/* the kinds of QL2's shape (support/judge.ts) */
const HELD = ["text-held", "blob-held", "text-mixed"]

/** The ways a list reaches database: a table list, derived lists with an anchor or none, over a column or an expression, joined, merged over shards, and listOptions on the relational query API */
export const PATHS = [
	"table",
	"anchored",
	"anchorless",
	"expr",
	"expr-anchored",
	"joined",
	"merged",
	"merged-derived",
	"listOptions",
] as const
export type ListPath = (typeof PATHS)[number]

/* the paths database builds the filter for from the parsed request; a derived list and listOptions AND their caller's own */
const FILTERED: readonly ListPath[] = ["table", "merged"]

export type ListCase = {
	/** NULL placement per key, absent for the direction's own */
	nulls: ReadonlyArray<"first" | "last" | undefined>
	deleting: boolean
	dirs: ReadonlyArray<"asc" | "desc">
	/** `g.gte.1`-style, over the plain INTEGER column g, with the SQL that selects the same rows */
	filter: { query: string; where: string } | undefined
	keys: readonly KeyKind[]
	limit: number
	mode: "cursor" | "page"
	path: ListPath
	/** each row as SQL literals: id, then each key, then g */
	rows: ReadonlyArray<readonly string[]>
	select: string | undefined
	shards: number
}

/** The filter of a case on a path database filters for, or none */
function filterOf(random: Random, path: ListPath): ListCase["filter"] {
	if (!FILTERED.includes(path) || !random.chance(0.3)) return undefined
	const [a, b] = [random.int(4), random.int(4)]
	return random.chance(0.5)
		? { query: `g.gte.${a}`, where: `g >= ${a}` }
		: { query: `g.in.(${a},${b})`, where: `g IN (${a}, ${b})` }
}

/** Rows with distinct ids, each key drawn from its kind (NULL at `nullRate`), and g a small integer */
function rowsOf(random: Random, keys: readonly KeyKind[]): string[][] {
	const nullRate = random.chance(0.4) ? 0.3 : 0
	const count = 3 + random.int(9)
	const rows = new Map<string, string[]>()
	for (let index = 0; index < count; index++) {
		const id = `r${String(index).padStart(2, "0")}${random.pick(["a", "b"])}`
		const values = keys.map((kind) => (random.chance(nullRate) ? "NULL" : random.pick(kind.values)))
		rows.set(id, [`'${id}'`, ...values, String(random.int(4))])
	}
	return [...rows.values()]
}

/** What a driver's drizzle reads back from SQLite, so a case stores only rows its app could read */
export type Reads = {
	/** an INTEGER past 2^53, exactly */
	bigints: boolean
	/** a number stored in a BLOB column of drizzle's buffer mode, which Buffer.from refuses on some drivers */
	blobNumbers: boolean
}

const PAST_2_53 = /^-?\d{16,}$/
const NUMBER = /^-?[\d.]/

/** The kinds a driver's drizzle reads every value of, each with the values it cannot read left out */
function kindsFor({ bigints, blobNumbers }: Reads): KeyKind[] {
	return KINDS.map((kind) => {
		const buffer = kind.drizzle.builder === "blob" && kind.drizzle.mode === "buffer"
		const values = kind.values.filter(
			(value) => (bigints || !PAST_2_53.test(value)) && (blobNumbers || !buffer || !NUMBER.test(value)),
		)
		return { ...kind, values }
	}).filter((kind) => kind.values.length > 1)
}

/** One case drawn from `random`, of values the driver reads */
export function listCase(random: Random, reads: Reads): ListCase {
	const kinds = kindsFor(reads)
	/* a quarter of the cases lead with a held kind beside numeric-looking TEXT: QL2's inputs, and the ones 0.21 fixed where 0.20.1 answered 400 */
	const held = kinds.filter((kind) => HELD.includes(kind.name))
	const first = random.chance(0.25) ? random.pick(held) : random.pick(kinds)
	const keys = random.chance(0.5) ? [first, random.pick(kinds)] : [first]
	const path = random.pick(PATHS)
	const merged = path.startsWith("merged")
	return {
		deleting: random.chance(0.5),
		dirs: keys.map(() => random.pick(["asc", "desc"] as const)),
		filter: filterOf(random, path),
		keys,
		limit: 1 + random.int(3),
		mode: !merged && random.chance(0.35) ? "page" : "cursor",
		nulls: keys.map(() => random.pick([undefined, "first", "last"] as const)),
		path,
		rows: rowsOf(random, keys),
		select: path === "table" && random.chance(0.3) ? random.pick(["id", "id,k", "id,g"]) : undefined,
		shards: merged ? 2 + random.int(2) : 1,
	}
}

/** The case's order parameter, `k.asc.nullslast,k2.desc` */
export const orderOf = (c: ListCase): string =>
	c.keys
		.map((_, index) => `${index === 0 ? "k" : "k2"}.${c.dirs[index]}${c.nulls[index] ? `.nulls${c.nulls[index]}` : ""}`)
		.join(",")

/** A label that names the case in a report: its key kinds, path, walk and order */
export const labelOf = (c: ListCase): string =>
	`[${c.keys.map((kind) => kind.name).join(",")}] ${c.path} ${c.mode} ${orderOf(c)} limit ${c.limit}` +
	`${c.mode === "cursor" ? (c.deleting ? " deleting" : " keeping") : ""}${c.shards > 1 ? ` shards ${c.shards}` : ""}` +
	`${c.filter ? ` filter ${c.filter.query}` : ""}${c.select ? ` select ${c.select}` : ""}`
