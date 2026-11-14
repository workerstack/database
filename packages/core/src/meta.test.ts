import { describe, expect, it } from "vitest"
import * as z from "zod"
import {
	FILTER_GRAMMAR,
	DATABASE_META_KEY,
	DATABASE_META_VERSION,
	carryDatabaseMeta,
	type EntityMetaInput,
	type QueryMetaInput,
	databaseMeta,
	readEntityMeta,
	readDatabaseMeta,
	readQueryMeta,
} from "./meta.ts"

const ENTITY: EntityMetaInput = {
	generated: ["id"],
	identity: "id",
	immutable: ["id"],
	kind: "entity",
	name: "post",
	softDelete: null,
	states: { column: "status", initial: "draft", terminal: ["live"], values: ["draft", "live"] },
	tenantColumn: null,
	partialUniqueIndexes: [],
	uniqueIndexes: [{ columns: ["slug"], name: "post_slug" }],
}

const QUERY: QueryMetaInput = {
	defaultOrder: "id.asc",
	filterable: ["status"],
	grammar: FILTER_GRAMMAR,
	kind: "query",
	maxLimit: 100,
	searchable: null,
	selectable: ["id"],
	sortable: ["id"],
	stableTiebreak: "id",
}

function read(payload: unknown, maxVersion?: number) {
	const said: string[] = []
	const options = { onDiagnostic: (m: string) => said.push(m), ...(maxVersion === undefined ? {} : { maxVersion }) }
	return { meta: readDatabaseMeta({ [DATABASE_META_KEY]: payload }, options), said }
}

describe("databaseMeta and the readers", () => {
	it("stamps the current version and reads both kinds back", () => {
		const stamp = databaseMeta(ENTITY)
		expect(stamp[DATABASE_META_KEY].v).toBe(DATABASE_META_VERSION)
		expect(readEntityMeta(stamp)).toEqual({ ...ENTITY, v: DATABASE_META_VERSION })
		expect(readQueryMeta(databaseMeta(QUERY))).toMatchObject({ grammar: "postgrest", kind: "query" })
		expect(readEntityMeta(databaseMeta(QUERY))).toBeNull()
		expect(readQueryMeta(databaseMeta(ENTITY))).toBeNull()
	})

	it("reads nothing from what carries no payload", () => {
		expect(readDatabaseMeta(null)).toBeNull()
		expect(readDatabaseMeta([])).toBeNull()
		expect(readDatabaseMeta({ type: "object" })).toBeNull()
	})

	it.each([
		["not an object", "x", "payload is not an object"],
		["no version", { kind: "entity" }, "payload has no valid integer `v`"],
		["a fractional version", { kind: "entity", v: 1.5 }, "payload has no valid integer `v`"],
		["an unknown kind", { kind: "view", v: 1 }, 'unknown kind "view"'],
	])("refuses a payload with %s", (_name, payload, message) => {
		expect(read(payload)).toEqual({ meta: null, said: [`${DATABASE_META_KEY}: ${message}`] })
	})

	it("refuses a payload newer than the reader instead of guessing", () => {
		expect(read({ ...ENTITY, v: 3 }, 2).said).toEqual([
			`${DATABASE_META_KEY}: payload is v3, this reader understands up to v2 — refusing to guess`,
		])
	})
})

describe("carryDatabaseMeta", () => {
	it("re-stamps an extended Zod schema with the facts the original carries (M-M10)", () => {
		const base = z.object({ id: z.string() }).meta(databaseMeta(ENTITY))
		const extended = carryDatabaseMeta(base, base.extend({ extra: z.string() }))
		expect(extended).not.toBeNull()
		expect(readEntityMeta(z.toJSONSchema(extended as z.ZodObject))).toMatchObject({ name: "post" })
	})

	it("re-stamps from a JSON Schema, and gives null when the source carries nothing", () => {
		const base = z.object({ id: z.string() }).meta(databaseMeta(ENTITY))
		expect(carryDatabaseMeta(z.toJSONSchema(base), z.object({}))).not.toBeNull()
		expect(carryDatabaseMeta(z.object({}), z.object({}))).toBeNull()
		expect(carryDatabaseMeta({ meta: () => undefined }, z.object({}))).toBeNull()
		expect(carryDatabaseMeta("x", z.object({}))).toBeNull()
	})
})
