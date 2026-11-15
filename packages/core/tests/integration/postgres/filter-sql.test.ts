/**
 * QL1 of r23: buildListQuery over a Postgres table lowered its filter as SQLite SQL. `like` and
 * `ilike` with an inner `*`, an exact `like`, `contains`, every date filter, a fraction on an integer
 * column and an empty `or()` were each a driver 500, and `ilike.a*t` ran as a case-sensitive LIKE,
 * returning fewer rows with no error. Each filter now runs as Postgres SQL, against a hand-written
 * oracle WHERE on the same rows; a number finer than a double carries is refused, as one past 2^53 is.
 */
import { getTableColumns } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { boolean, date, doublePrecision, integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import type pg from "pg"
import { describe, expect, it } from "vitest"
import { SEALED } from "../../../src/query/__fixtures__/cursor-secret.ts"
import { queryHelpers } from "../../../src/query/drizzle.ts"
import { type FilterFieldSpec, validateFilter } from "../../../src/query/filter-validate.ts"
import { createListQuerySchema } from "../../../src/query/schema.ts"
import { buildListQuery } from "../../../src/query/sqlite/build-list-query.ts"
import type { FilterAST } from "../../../src/query/types.ts"
import { usePg } from "../support/pg.ts"

const item = pgTable("ql1_item", {
	id: text("id").primaryKey(),
	title: text("title"),
	i: integer("i"),
	num: numeric("num", { mode: "number" }),
	n: doublePrecision("n"),
	d: timestamp("d", { mode: "date", withTimezone: true }),
	day: date("day", { mode: "date" }),
	b: boolean("b"),
	tags: jsonb("tags"),
})

const ROWS = `INSERT INTO ql1_item VALUES
	('a', 'Apple pie', 1, 1, 1, '2025-01-01T00:00:00Z', '2025-01-01', true, '["red"]'),
	('b', 'Apricot', 2, 1.5, 0.5, '2024-06-01T00:00:00Z', '2024-06-01', false, '["blue", 2]'),
	('c', 'avocat', 3, 0.5, 2, '2023-01-01T00:00:00Z', '2023-01-01', null, '[]'),
	('d', 'banana', null, null, null, null, null, true, null),
	('e', '50%_off', 5, 2, 3, '2024-01-01T00:00:00.001Z', '2024-01-01', false, '{"red": 1}')`

const schema = createListQuerySchema({
	filter: { b: "boolean", d: "date", i: "number", n: "number", num: "number", title: "string" },
	sort: ["id"],
})

async function seeded(client: pg.Client): Promise<void> {
	await client.query(`CREATE TEMP TABLE ql1_item (id text PRIMARY KEY, title text, i integer, num numeric,
		n double precision, d timestamptz, day date, b boolean, tags jsonb)`)
	await client.query(ROWS)
}

const oracle = async (client: pg.Client, where: string): Promise<string[]> =>
	(await client.query(`SELECT id FROM ql1_item WHERE ${where} ORDER BY id`)).rows.map((row) => row.id as string)

/** The ids buildListQuery serves for `parsed`, in id order */
async function served(client: pg.Client, parsed: ReturnType<typeof schema.parse>): Promise<string[]> {
	const built = buildListQuery({ ...SEALED, parsed, table: item as never })
	const select = drizzle({ client })
		.select({ ...getTableColumns(item), ...built.extras })
		.from(item)
		.$dynamic()
	const rows = await (built.where === undefined ? select : select.where(built.where))
		.orderBy(...built.orderBy)
		.limit(built.limit)
	return queryHelpers.paginate(rows, built)[0].map((row) => row.id as string)
}

/** A schema filter and the WHERE Postgres answers it with */
const SCHEMA_CASES: Array<[string, string]> = [
	["title.like.Ap*", "title LIKE 'Ap%'"],
	["title.like.*pie*", "title LIKE '%pie%'"],
	["title.like.A*e", "title LIKE 'A%e'"],
	["title.like.banana", "title = 'banana'"],
	["title.like.50%_*", "title LIKE '50\\%\\_%'"],
	["title.like.*", "title IS NOT NULL"],
	["title.ilike.ap*", "title ILIKE 'ap%'"],
	["title.ilike.*APR*", "title ILIKE '%APR%'"],
	["title.ilike.a*t", "title ILIKE 'a%t'"],
	["title.ilike.APRICOT", "title ILIKE 'apricot'"],
	["i.gt.1.5", "i > 1.5"],
	["i.in.(1,3)", "i IN (1, 3)"],
	["i.nin.(1,3)", "i NOT IN (1, 3)"],
	["i.in.()", "false"],
	["i.nin.()", "true"],
	["num.lt.1.5", "num < 1.5"],
	["num.eq.0.5", "num = 0.5"],
	["n.gte.0.5", "n >= 0.5"],
	["d.gte.1704067200000", "d >= to_timestamp(1704067200)"],
	["d.lt.1704067200001", "d < '2024-01-01T00:00:00.001Z'"],
	["b.is.true", "b IS TRUE"],
	["b.is.null", "b IS NULL"],
	["or()", "false"],
	["and()", "true"],
	["or(i.eq.1,title.ilike.*BAN*)", "i = 1 OR title ILIKE '%BAN%'"],
]

/** A field spec's filter, through validateFilter, and the WHERE Postgres answers it with */
const SPEC_CASES: Array<[string, Record<string, FilterFieldSpec>, string]> = [
	[
		"tags.contains.red",
		{ tags: { operators: ["contains"], type: "string" } },
		`jsonb_typeof(tags) = 'array' AND tags @> '"red"'`,
	],
	[
		"tags.contains.2",
		{ tags: { operators: ["contains"], type: "number" } },
		`jsonb_typeof(tags) = 'array' AND tags @> '2'`,
	],
	["d.gte.2024-01-01", { d: { format: "iso", type: "date" } }, "d >= '2024-01-01T00:00:00Z'"],
	["d.lt.2024-06-01T00:00:00Z", { d: { format: "iso", type: "date" } }, "d < '2024-06-01T00:00:00Z'"],
	["d.in.(1704067200001)", { d: { operators: ["in"], type: "date" } }, "d = '2024-01-01T00:00:00.001Z'"],
	["day.gte.1704067200000", { day: { type: "date" } }, "day >= '2024-01-01'"],
]

/** The AST of `filter`, which `fields` must take */
function astOf(filter: string, fields: Parameters<typeof validateFilter>[1]): FilterAST {
	const result = validateFilter(filter, fields)
	if (result === null || !result.valid) throw new Error(`${filter}: ${result?.errors.join("; ") ?? "empty"}`)
	return result.ast
}

const EXACT_OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte"] as const
const EXACT: Record<(typeof EXACT_OPERATORS)[number], (row: bigint, bound: bigint) => boolean> = {
	eq: (row, bound) => row === bound,
	gt: (row, bound) => row > bound,
	gte: (row, bound) => row >= bound,
	lt: (row, bound) => row < bound,
	lte: (row, bound) => row <= bound,
	ne: (row, bound) => row !== bound,
}

describe("a filter on a Postgres table runs as Postgres SQL (QL1)", () => {
	const sessions = usePg()

	it("returns the oracle's rows for every operator a schema field takes", async () => {
		const client = sessions.pg()
		await seeded(client)
		for (const [filter, where] of SCHEMA_CASES) {
			const parsed = schema.parse({ filter, order: "id.asc" })
			expect(await served(client, parsed), filter).toEqual(await oracle(client, where))
		}
	})

	it("returns the oracle's rows for contains and a date a field spec types", async () => {
		const client = sessions.pg()
		await seeded(client)
		for (const [filter, fields, where] of SPEC_CASES) {
			const ast = astOf(filter, fields)
			const parsed = { ...schema.parse({ order: "id.asc" }), filterAst: ast, validated: true as const }
			expect(await served(client, parsed), filter).toEqual(await oracle(client, where))
		}
	})

	/* QL3 of r23 on Postgres, whose timestamp holds microseconds: an instant past them lies between two */
	it("compares an ISO instant exactly on a timestamp holding microseconds, past them too", async () => {
		const client = sessions.pg()
		await seeded(client)
		const micros = [999_498, 999_499, 999_500, 999_501, 999_502]
		await client.query("DELETE FROM ql1_item")
		for (const [i, us] of micros.entries())
			await client.query("INSERT INTO ql1_item (id, d) VALUES ($1, $2)", [`r${i}`, `2024-01-01T00:00:00.${us}Z`])
		const spec = { d: { format: "iso" as const, operators: [...EXACT_OPERATORS], type: "date" as const } }
		for (const fraction of ["9995", "999500", "9995001", "999499999", "9994995", "999501"])
			for (const operator of EXACT_OPERATORS) {
				const filter = `d.${operator}.2024-01-01T00:00:00.${fraction}Z`
				const ast = astOf(filter, spec)
				const parsed = { ...schema.parse({ order: "id.asc" }), filterAst: ast, validated: true as const }
				const nanos = BigInt(fraction.padEnd(9, "0"))
				const want = micros
					.map((us, i) => [BigInt(us) * 1000n, `r${i}`] as const)
					.filter(([at]) => EXACT[operator](at, nanos))
					.map(([, id]) => id)
				expect(await served(client, parsed), filter).toEqual(want)
			}
	})

	it("refuses a number finer than a double carries, as the 400 one past 2^53 is", () => {
		const parsed = schema.safeParse({ filter: "num.lt.1.000000000000000001", order: "id.asc" })
		expect(parsed.success).toBe(false)
		expect(JSON.stringify(parsed.error?.issues)).toContain("1.000000000000000001")
	})
})
