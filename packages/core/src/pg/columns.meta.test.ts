/** What each `c` helper records on its column for codegen to read at runtime (the 0.12 review's F1–F19 class) */
import { getTableColumns } from "drizzle-orm"
import { pgTable } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import * as z from "zod"
import { columnMeta } from "../meta/column.ts"
import { c } from "./columns.ts"

const RULES = { max: 5, pattern: "/^[a-z]+$/" } as const
const schema = z.object({ s: z.string() })
const STATES = ["draft", "live"] as const
const machine = { initial: "draft", terminal: ["live"] } as const
const columns = getTableColumns(
	pgTable("item", {
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
		expect(columnMeta(columns.id)).toEqual({ kind: "id", prefix: "itm" })
		expect(columnMeta(columns.name)).toEqual({ constraints: RULES, kind: "text" })
		expect(columnMeta(columns.name)?.constraints).toBe(RULES)
		expect(columnMeta(columns.owner)).toEqual({ constraints: { max: 48 }, kind: "ref" })
		expect(columnMeta(columns.state)).toEqual({ kind: "enum", states: machine, values: STATES })
		expect(columnMeta(columns.state)?.values).toBe(STATES)
		expect(columnMeta(columns.data)?.schema).toBe(schema)
		expect(columnMeta(columns.data)).toMatchObject({ constraints: { maxBytes: 100 }, kind: "json" })
		expect(columnMeta(columns.count)).toEqual({ constraints: { min: 0 }, kind: "integer" })
		expect(columnMeta(columns.createdAt)).toEqual({ constraints: { private: true }, kind: "createdAt" })
		for (const [key, kind] of [
			["ratio", "real"],
			["flag", "boolean"],
			["at", "timestamp"],
			["updatedAt", "updatedAt"],
			["deletedAt", "deletedAt"],
		] as const)
			expect(columnMeta(columns[key])).toEqual({ kind })
	})

	it("records serialId, and nothing on a column no c helper built", () => {
		const table = getTableColumns(pgTable("seq", { id: c.serialId() }))
		expect(columnMeta(table.id)).toEqual({ kind: "serialId" })
		expect(columnMeta({})).toBeUndefined()
		expect(columnMeta(null)).toBeUndefined()
		expect(columnMeta({ config: {} })).toBeUndefined()
	})
})

/* plan 24: an enum's format and schema are constraints, never part of its state machine */
describe("c.enum format and schema", () => {
	const CYCLES = ["h12", "h23"] as const
	const start = { initial: "h23" } as const

	it("keeps format among the constraints and out of the states", () => {
		const table = getTableColumns(
			pgTable("t", {
				cycle: c.enum("cycle", CYCLES, { format: "uts35-hc" }),
				staged: c.enum("staged", CYCLES, { ...start, format: "uts35-hc", nomutate: true }),
				unset: c.enum("unset", CYCLES, { format: undefined }),
			}),
		)
		expect(columnMeta(table.cycle)).toEqual({ constraints: { format: "uts35-hc" }, kind: "enum", values: CYCLES })
		expect(columnMeta(table.staged)).toEqual({
			constraints: { format: "uts35-hc", nomutate: true },
			kind: "enum",
			states: start,
			values: CYCLES,
		})
		expect(columnMeta(table.unset)).toEqual({ kind: "enum", values: CYCLES })
	})

	it("keeps a schema a JavaScript caller passes among the constraints, for codegen to refuse by name", () => {
		const given = z.enum(CYCLES)
		// @ts-expect-error c.enum takes no schema: its values are its rule
		const cycle = c.enum("cycle", CYCLES, { schema: given })
		const meta = columnMeta(getTableColumns(pgTable("t", { cycle })).cycle)
		expect(meta).toEqual({ constraints: { schema: given }, kind: "enum", values: CYCLES })
		expect(meta?.constraints?.["schema"]).toBe(given)
	})
})
