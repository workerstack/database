/** What each `c` helper records on its column for codegen to read at runtime (the 0.12 review's F1–F19 class) */
import { getTableColumns } from "drizzle-orm"
import { sqliteTable } from "drizzle-orm/sqlite-core"
import { describe, expect, it } from "vitest"
import * as z from "zod"
import { combColumnMeta } from "../meta/column.ts"
import { c } from "./columns.ts"

const RULES = { max: 5, pattern: "/^[a-z]+$/" } as const
const schema = z.object({ s: z.string() })
const STATES = ["draft", "live"] as const
const machine = { initial: "draft", terminal: ["live"] } as const
const columns = getTableColumns(
	sqliteTable("item", {
		id: c.id("itm"),
		name: c.text("name", RULES).notNull(),
		owner: c.ref("owner_id", { max: 48 }),
		state: c.enum("state", STATES, machine),
		data: c.json("data", schema, { maxBytes: 100 }),
		count: c.integer("count", { min: 0 }),
		ratio: c.real("ratio"),
		flag: c.boolean("flag"),
		at: c.timestamp("at"),
		createdAt: c.createdAt("created_at", { private: true }),
		updatedAt: c.updatedAt("updated_at"),
		deletedAt: c.deletedAt("deleted_at"),
	}),
)

describe("c column metadata", () => {
	it("records each helper's kind and what it was given, the very objects passed", () => {
		expect(combColumnMeta(columns.id)).toEqual({ kind: "id", prefix: "itm" })
		expect(combColumnMeta(columns.name)).toEqual({ constraints: RULES, kind: "text" })
		expect(combColumnMeta(columns.name)?.constraints).toBe(RULES)
		expect(combColumnMeta(columns.owner)).toEqual({ constraints: { max: 48 }, kind: "ref" })
		expect(combColumnMeta(columns.state)).toEqual({ kind: "enum", states: machine, values: STATES })
		expect(combColumnMeta(columns.state)?.values).toBe(STATES)
		expect(combColumnMeta(columns.data)?.schema).toBe(schema)
		expect(combColumnMeta(columns.data)).toMatchObject({ constraints: { maxBytes: 100 }, kind: "json" })
		expect(combColumnMeta(columns.count)).toEqual({ constraints: { min: 0 }, kind: "integer" })
		expect(combColumnMeta(columns.createdAt)).toEqual({ constraints: { private: true }, kind: "createdAt" })
		for (const [key, kind] of [
			["ratio", "real"],
			["flag", "boolean"],
			["at", "timestamp"],
			["updatedAt", "updatedAt"],
			["deletedAt", "deletedAt"],
		] as const)
			expect(combColumnMeta(columns[key])).toEqual({ kind })
	})

	it("records serialId, and nothing on a column no c helper built", () => {
		const table = getTableColumns(sqliteTable("seq", { id: c.serialId() }))
		expect(combColumnMeta(table.id)).toEqual({ kind: "serialId" })
		expect(combColumnMeta({})).toBeUndefined()
		expect(combColumnMeta(null)).toBeUndefined()
		expect(combColumnMeta({ config: {} })).toBeUndefined()
	})
})

/* the 0.12 review's F38: the generator honours a timestamp's bounds, which its type refused */
describe("c.timestamp bounds (F38)", () => {
	it("takes min and max, as codegen bounds the DTO by them", () => {
		const since = getTableColumns(sqliteTable("t", { since: c.timestamp("since", { max: 10, min: 0 }) })).since
		expect(combColumnMeta(since)).toEqual({ constraints: { max: 10, min: 0 }, kind: "timestamp" })
	})
})

/* plan 24: an enum's format and schema are constraints, never part of its state machine */
describe("c.enum format and schema", () => {
	const CYCLES = ["h12", "h23"] as const
	const start = { initial: "h23" } as const

	it("keeps format among the constraints and out of the states", () => {
		const table = getTableColumns(
			sqliteTable("t", {
				cycle: c.enum("cycle", CYCLES, { format: "uts35-hc" }),
				staged: c.enum("staged", CYCLES, { ...start, format: "uts35-hc", nomutate: true }),
				unset: c.enum("unset", CYCLES, { format: undefined }),
			}),
		)
		expect(combColumnMeta(table.cycle)).toEqual({ constraints: { format: "uts35-hc" }, kind: "enum", values: CYCLES })
		expect(combColumnMeta(table.staged)).toEqual({
			constraints: { format: "uts35-hc", nomutate: true },
			kind: "enum",
			states: start,
			values: CYCLES,
		})
		expect(combColumnMeta(table.unset)).toEqual({ kind: "enum", values: CYCLES })
	})

	it("keeps a schema a JavaScript caller passes among the constraints, for codegen to refuse by name", () => {
		const given = z.enum(CYCLES)
		// @ts-expect-error c.enum takes no schema: its values are its rule
		const cycle = c.enum("cycle", CYCLES, { schema: given })
		const meta = combColumnMeta(getTableColumns(sqliteTable("t", { cycle })).cycle)
		expect(meta).toEqual({ constraints: { schema: given }, kind: "enum", values: CYCLES })
		expect(meta?.constraints?.["schema"]).toBe(given)
	})
})
