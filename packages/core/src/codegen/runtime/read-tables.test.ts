import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { integer, pgEnum, pgSchema, pgTable } from "drizzle-orm/pg-core"
import {
	check,
	foreignKey,
	integer as sqliteInteger,
	primaryKey,
	sqliteTable,
	text as sqliteText,
} from "drizzle-orm/sqlite-core"
import { c } from "../../sqlite/columns.ts"
import { analyzeNamespace, parseField } from "../__fixtures__/runtime.ts"
import { fixtureRoot } from "../__fixtures__/temp.ts"
import { readTables } from "./child.ts"
import { exportsHolding, snapshotOf } from "./read-tables.ts"

let dir: string

/** An importer under which other.ts and zod do not load on their own */
const failingOn = (url: string) =>
	url.endsWith("other.ts") || url.includes("/zod/") ? Promise.reject(new Error("no")) : import(url)

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(fixtureRoot(), "database-read-tables-"))
})

afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

const HEAD = `import { sqliteTable } from "drizzle-orm/sqlite-core"\nimport { c } from "@workerstack/database/sqlite/columns"\n`

/** `files` written into the fixture directory, the tables file `db.core.tables.ts` among them */
function write(files: Record<string, string>): string {
	for (const [name, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
		fs.writeFileSync(path.join(dir, name), text)
	}
	return path.join(dir, "db.core.tables.ts")
}

/* these tables hold no array column, so the reader asks no element type */
const noArrays = (): boolean => {
	throw new Error("asked for an array column's element")
}

describe("exportsHolding: where a value is exported, in a stable order", () => {
	it("puts a module other than the tables file first, then the shorter path, then the name (the A tie)", () => {
		const value = {}
		const loaded = [
			{ external: false, module: "/p/db.tables.ts", namespace: { a: value } },
			{ external: false, module: "/p/lib/long/schemas.ts", namespace: { s: value } },
			{ external: false, module: "/p/lib/b.ts", namespace: { z: value, y: value } },
			{ external: false, module: "/p/lib/a.ts", namespace: { x: value, other: {} } },
			{ external: true, module: "pkg", namespace: { w: value } },
		]
		expect(exportsHolding(value, loaded, "/p/db.tables.ts").map((at) => `${at.module}:${at.name}`)).toEqual([
			"pkg:w",
			"/p/lib/a.ts:x",
			"/p/lib/b.ts:y",
			"/p/lib/b.ts:z",
			"/p/lib/long/schemas.ts:s",
			"/p/db.tables.ts:a",
		])
	})
})

describe("readTables", () => {
	it("reads each exported table once, its schema found in a module and a package it imports", async () => {
		const tables = write({
			"db.core.tables.ts": `${HEAD}import * as z from "zod"
import { prefs } from "./schemas.ts"
import { ipList } from "database-fixture-schemas"
import type { Unused } from "database-fixture-types-only"
export const note = sqliteTable("note", { id: c.id("not"), prefs: c.json("prefs", prefs), ips: c.json("ips", ipList) })
export { note as alias }
export const plain = z.string()
`,
			"node_modules/database-fixture-schemas/index.js": `import * as z from "zod"\nexport const ipList = z.array(z.string())\n`,
			"node_modules/database-fixture-schemas/package.json": JSON.stringify({
				exports: "./index.js",
				name: "database-fixture-schemas",
				type: "module",
			}),
			"schemas.ts": `import * as z from "zod"\nexport const prefs = z.object({ a: z.string() })\n`,
		})
		const { tables: read } = await readTables(tables)
		expect(read.map((table) => table.exportName)).toEqual(["alias"])
		const columns = Object.fromEntries((read[0]?.columns ?? []).map((column) => [column.key, column.database?.schema]))
		expect(columns["prefs"]).toEqual({ external: false, module: path.join(dir, "schemas.ts"), name: "prefs" })
		expect(columns["ips"]).toEqual({ external: true, module: "database-fixture-schemas", name: "ipList" })
	})

	it("skips a module that does not load on its own, and names it when a schema is then found nowhere", async () => {
		const tables = write({
			"db.core.tables.ts": `${HEAD}import * as z from "zod"
import { other } from "./other.ts"
export const note = sqliteTable("note", { id: c.id("not"), prefs: c.json("prefs", z.object({ other: z.literal(other) })) })
`,
			"other.ts": `export const other = "o"\n`,
		})
		await expect(readTables(tables, failingOn)).rejects.toThrow(
			`note.prefs: no module of the project exports the schema its c.json is given (${path.join(dir, "other.ts")}, zod would not load on their own)`,
		)
	})
})

/* plan 24: a text or number column's `schema`, located as a c.json schema is and carried as its input JSON Schema */
const SCHEMA_TABLES = `${HEAD}import * as z from "zod"
import { dateOrder, positive } from "./schemas.ts"
export const evenMinutes = z.int().refine((value) => value % 2 === 0, { error: "Must be even" })
export const code = z.string().min(2).meta({ id: "database/Code~1" })
export const codeOrNone = z.union([code, z.literal("none")])
export const note = sqliteTable("note", {
	id: c.id("not"),
	dateOrder: c.text("date_order", { schema: dateOrder, trim: true }),
	slot: c.integer("slot", { min: 0, schema: evenMinutes }),
	ratio: c.real("ratio", { schema: positive }),
	code: c.text("code", { schema: code }),
	codeOrNone: c.text("code_or_none", { schema: codeOrNone }),
	ownerId: c.ref("owner_id", { schema: dateOrder }),
})
`

/** Where a fixture file of `dir` exports `name` */
const exportAt = (module: string, name: string) => ({ external: false, module: path.join(dir, module), name })

/** The error for an unexported column schema, the packages that would not load named by `skipped` */
const unexported = (skipped: string) =>
	`users.dateOrder: no module of the project exports the schema its schema key is given${skipped}; export it, above the table that names it, so the generated DTOs can import it`

describe("readTables: a text or number column's schema, located", () => {
	it("in the tables module or a module it imports, with its input JSON Schema, self-contained", async () => {
		const tables = write({
			"db.core.tables.ts": SCHEMA_TABLES,
			"schemas.ts": `import * as z from "zod"\nexport const dateOrder = z.enum(["iso", "dmy", "mdy"])\nexport const positive = z.number().positive()\n`,
		})
		const { tables: read } = await readTables(tables)
		const database = Object.fromEntries((read[0]?.columns ?? []).map((column) => [column.key, column.database]))
		expect(database["dateOrder"]).toMatchObject({
			constraints: { trim: true },
			schema: exportAt("schemas.ts", "dateOrder"),
			schemaJson: { enum: ["iso", "dmy", "mdy"], type: "string" },
		})
		expect(database["slot"]).toMatchObject({
			constraints: { min: 0 },
			schema: exportAt("db.core.tables.ts", "evenMinutes"),
			schemaJson: { maximum: Number.MAX_SAFE_INTEGER, minimum: Number.MIN_SAFE_INTEGER, type: "integer" },
		})
		expect(database["ratio"]).toMatchObject({
			schema: exportAt("schemas.ts", "positive"),
			schemaJson: { exclusiveMinimum: 0, type: "number" },
		})
		/* a schema zod files under $defs by its id is inlined: a $ref into the literal's own root would dangle in an allOf */
		expect(database["code"]?.schemaJson).toEqual({ minLength: 2, type: "string" })
		expect(database["codeOrNone"]?.schemaJson).toEqual({
			anyOf: [
				{ minLength: 2, type: "string" },
				{ const: "none", type: "string" },
			],
		})
		/* a helper that takes no schema keeps the key, so the constraint check names it; nothing is located */
		expect(database["ownerId"]).toMatchObject({ constraints: { schema: true }, schema: null, schemaJson: null })
		expect(database["id"]).toMatchObject({ schema: null, schemaJson: null })
	})
})

describe("readTables: a text or number column's schema, refused", () => {
	it("when inline, so no module exports it, naming the packages that would not load", async () => {
		const tables = write({
			"db.core.tables.ts": `${HEAD}import * as z from "zod"
import { other } from "./other.ts"
export const users = sqliteTable("users", { dateOrder: c.text("date_order", { schema: z.enum(["iso", other]) }) })
`,
			"other.ts": `export const other = "dmy"\n`,
		})
		await expect(readTables(tables)).rejects.toThrow(unexported(""))
		await expect(readTables(tables, failingOn)).rejects.toThrow(
			unexported(` (${path.join(dir, "other.ts")}, zod would not load on their own)`),
		)
	})

	it("when it is no zod schema", async () => {
		const plain = write({
			"db.core.tables.ts": `${HEAD}export const parser = { parse() {} }
export const users = sqliteTable("users", { dateOrder: c.text("date_order", { schema: parser }) })
`,
		})
		await expect(readTables(plain)).rejects.toThrow(
			"users.dateOrder: the constraint schema is no zod schema; database's DTOs are zod 4, so the schema must be one",
		)
	})

	it("when zod gives it no JSON Schema form, with zod's own message", async () => {
		const custom = write({
			"db.core.tables.ts": `${HEAD}import * as z from "zod"
export const anything = z.custom()
export const users = sqliteTable("users", { dateOrder: c.text("date_order", { schema: anything }) })
`,
		})
		await expect(readTables(custom)).rejects.toThrow(
			"users.dateOrder: the schema its schema key is given has no JSON Schema form (zod: Custom types cannot be represented in JSON Schema); database publishes every DTO rule",
		)
	})

	it("when exported below its table, the module failing to load with its own error", async () => {
		const tables = write({
			"db.core.tables.ts": `${HEAD}import * as z from "zod"
export const users = sqliteTable("users", { dateOrder: c.text("date_order", { schema: late }) })
export const late = z.enum(["iso"])
`,
		})
		await expect(readTables(tables)).rejects.toThrow(/^Cannot access 'late' before initialization/)
	})
})

/** A namespace exporting one table `t` of `columns` */
const oneTable = (columns: Record<string, unknown>) => ({ t: sqliteTable("t", columns as never) })

describe("snapshotOf: what a column or table cannot be", () => {
	it("refuses a constraint that is no boolean, number or string, a machine of another shape, and enum values not strings", () => {
		expect(() => analyzeNamespace(oneTable({ n: c.text("n", { max: [5] } as never) }))).toThrow(
			"t.n: the constraint max is a object; database reads a boolean, a number or a string",
		)
		expect(() => analyzeNamespace(oneTable({ s: c.enum("s", ["a"], { initial: 1 } as never) }))).toThrow(
			"t.s: its state machine is not { initial?, terminal?, transitions? } of state names",
		)
		expect(() => analyzeNamespace(oneTable({ s: c.enum("s", [1] as never) }))).toThrow(
			"t.s: c.enum takes an array of strings",
		)
		expect(
			analyzeNamespace(oneTable({ n: c.text("n", { max: undefined }) })).tables[0]?.fields[0]?.constraints.max,
		).toBeNull()
	})

	it("refuses a key into a table the tables file does not export, naming where it is, or that it is nowhere", () => {
		const account = sqliteTable("account", { id: c.id("acc") })
		const note = sqliteTable("note", { accountId: c.ref("account_id").references(() => account.id) })
		expect(() => analyzeNamespace({ note }, { account })).toThrow(
			"note.accountId references the table account (account in /fixture/schemas.ts), which the tables file does not export; export it there",
		)
		expect(() => analyzeNamespace({ note })).toThrow(
			"note.accountId references the table account, which no module of the project exports",
		)
	})

	it("reads a pg schema's table with its schema, an identity and a generated column", () => {
		const auth = pgSchema("auth")
		const account = auth.table("account", {
			id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
			total: integer("total").generatedAlwaysAs(sql`1 + 1`),
		})
		const [table] = analyzeNamespace({ account }).tables
		expect(table?.schema).toBe("auth")
		expect(table?.fields.map((field) => [field.name, field.identity, field.generated, field.hasDefault])).toEqual([
			["id", true, false, true],
			["total", false, true, false],
		])
	})
})

describe("snapshotOf: machines, keys and checks read in the parent's own process", () => {
	it("reads a machine with no initial state, a CHECK as SQL, and names a key whose target cannot be followed", () => {
		const [table] = analyzeNamespace({
			t: sqliteTable("t", { n: sqliteInteger("n"), s: c.enum("s", ["a", "b"], { terminal: ["b"] }) }, (t) => [
				check("t_n_positive", sql`${t.n} > 0`),
			]),
		}).tables
		expect(table?.fields.find((field) => field.name === "s")?.states).toEqual({
			initial: null,
			terminal: ["b"],
			transitions: null,
		})
		expect(table?.checkConstraints).toEqual([{ expression: '"n" > 0', name: "t_n_positive" }])
		const [flow] = analyzeNamespace({
			f: sqliteTable("f", {
				s: c.enum("s", ["a", "b"], { transitions: { a: ["b"] } }),
				u: c.text("u").unique("f_u"),
				v: c.text("v").unique(),
			}),
		}).tables
		expect(flow?.fields.map((field) => [field.states?.transitions ?? null, field.unique])).toEqual([
			[{ a: ["b"] }, null],
			[null, "f_u"],
			[null, "f_v_unique"],
		])
		const mood = pgEnum("mood", ["ok", "sad"])
		expect(analyzeNamespace({ p: pgTable("p", { m: mood("m") }) }).tables[0]?.fields[0]?.enumValues).toEqual([
			"ok",
			"sad",
		])
		const broken = sqliteTable("broken", {
			x: c.ref("x").references(() => {
				throw new Error("not yet defined")
			}),
		})
		expect(() => analyzeNamespace({ broken })).toThrow("broken: a foreign key's target cannot be read: not yet defined")
	})
})

describe("readTables: a module only types use (F42a)", () => {
	it("loads no module the tables file imports only for its types, however it imports them", async () => {
		const tables = write({
			"bad.ts": `export type Bad = string\nthrow new Error("bad loaded")\n`,
			"db.core.tables.ts": `${HEAD}import { type Bad } from "./bad.ts"
import { Bad as Also } from "./bad.ts"
let a: Bad | Also | undefined
export const note = sqliteTable("note", { id: c.id("not") })
`,
		})
		expect((await readTables(tables)).tables.map((table) => table.exportName)).toEqual(["note"])
	})
})

/* the 0.12 review's F36: a column named __proto__, which drizzle assigns onto the table as its prototype */
describe("snapshotOf: a table a column named __proto__ broke (F36)", () => {
	it("is refused, naming the export, not left out of every generated file", () => {
		const columns = Object.defineProperty({ id: c.id("brk") }, "__proto__", { enumerable: true, value: c.text("p") })
		const broken = sqliteTable("broken", columns as never)
		expect(() => analyzeNamespace({ broken })).toThrow(
			"broken: a column named __proto__ replaced this table's prototype, so drizzle cannot use it; rename the column",
		)
		/* any other value without drizzle's table name is no table, and is passed over */
		expect(analyzeNamespace({ answer: 42, list: [] }).tables).toEqual([])
	})
})

/* F46 of the 0.13.0 round: a composite foreign key is recorded on every one of its columns */
describe("snapshotOf: a composite foreign key (F46)", () => {
	it("records each column's own target column, with the key whole; a one-column key carries none", () => {
		const member = sqliteTable("member", { orgId: c.text("org_id"), userId: c.text("user_id") }, (t) => [
			primaryKey({ columns: [t.orgId, t.userId] }),
		])
		const grant = sqliteTable(
			"grant",
			{ org: c.text("org_id"), user: c.text("user_id"), owner: c.ref("owner_id").references(() => member.userId) },
			(t) => [foreignKey({ columns: [t.org, t.user], foreignColumns: [member.orgId, member.userId] })],
		)
		const fields = analyzeNamespace({ grant, member }).tables.find((table) => table.varName === "grant")?.fields
		const key = { columns: ["org", "user"], refColumns: ["orgId", "userId"] }
		expect(fields?.map((field) => field.foreignKey)).toEqual([
			expect.objectContaining({ column: "org", key, refColumn: "orgId", refTable: "member" }),
			expect.objectContaining({ column: "user", key, refColumn: "userId", refTable: "member" }),
			expect.objectContaining({ column: "owner", key: undefined, refColumn: "userId" }),
		])
	})
})

/* F49 of the 0.13.0 round: a Postgres array's dimensions, as drizzle reads them from .array() */
describe("snapshotOf: a Postgres array column's dimensions (F49)", () => {
	it("reads each, 0 for a column of one value, and refuses one drizzle could not read", () => {
		const bag = pgTable("bag", {
			one: integer("one"),
			list: integer("list").array(),
			grid: integer("grid").array("[][]"),
		})
		expect(analyzeNamespace({ bag }).tables[0]?.fields.map((field) => field.dimensions)).toEqual([0, 1, 2])
		const odd = pgTable("odd", { n: integer("n").array(3 as never) })
		expect(() => analyzeNamespace({ odd })).toThrow(
			'odd.n: drizzle could not read its array dimensions; write .array() or .array("[][]")',
		)
	})
})

/* F64: a crash in database's own reader says it is the reader's, naming the table, never the module's */
describe("snapshotOf: an error the reader did not mean", () => {
	it("names the table it was reading", () => {
		const t = sqliteTable("t", { id: sqliteText("id").primaryKey() })
		Object.defineProperty(t.id, "dataType", {
			get: () => {
				throw new TypeError("chunk.inlineParams is not a function")
			},
		})
		expect(() => snapshotOf([{ external: false, module: "/p/db.core.tables.ts", namespace: { t } }], noArrays)).toThrow(
			"database could not read table t: chunk.inlineParams is not a function",
		)
	})
})

/* F9 of the 0.14.1 review: c.enum takes the flags every other c helper does, beside its state machine */
describe("c.enum's options", () => {
	it("reads private, nomutate and tenant beside the state machine, on both dialects", () => {
		const source = 'c.enum("s", ["a", "b"], { initial: "a", nomutate: true, private: true, tenant: true })'
		for (const dialect of ["sqlite", "postgres"] as const) {
			const field = parseField("s", source, { dialect })
			expect(field.constraints, dialect).toMatchObject({ nomutate: true, private: true, tenant: true })
			expect(field.states, dialect).toEqual({ initial: "a", terminal: null, transitions: null })
		}
		expect(parseField("s", 'c.enum("s", ["a"], { private: true })').states).toBeNull()
	})
})
