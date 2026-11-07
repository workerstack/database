/**
 * Plan 24: a column's `format` and `schema` as the generated field holds and publishes them. An
 * enum's format is meaning alone, its values the rule; a nullable format text takes null and holds a
 * value to the format; a text or number column's schema runs after every rule of comb's, on the
 * rewritten value, its issues the caller's exactly as the schema yields them, its input JSON Schema
 * published in an `allOf` on the non-null member beside `x-comb-schema`.
 */
import { describe, expect, it } from "vitest"
import * as z from "zod"
import * as comb from "../../../index.ts"
import { fieldOf } from "../../__fixtures__/runtime.ts"
import type { FieldMeta, ImportsMeta } from "../../analyzer-types.ts"
import type { SchemaType } from "./dto-types.ts"
import { generateFieldSchema } from "./field-schema.ts"

const dateOrder = z.enum(["iso", "dmy", "mdy"])
const evenMinutes = z.int().refine((value) => value % 2 === 0, { error: "Must be even" })
const SCHEMAS = { dateOrder, evenMinutes }

/* the example meta a generated field names from the shared file, as `_m` */
const SHARED_META = { integer: { examples: [42] }, string: { examples: ["string"] } }
const RULE = { "x-comb-text": "no U+0000 or unpaired surrogate" }

/** The field `raw` declares under the key `f`, its schemas in scope */
const field = (raw: string): FieldMeta => fieldOf("f", raw, { scope: SCHEMAS })

/** The generated code of `raw`'s field in a `schemaType` DTO */
function codeOf(raw: string, schemaType: SchemaType): string {
	const imports: ImportsMeta = { enumImports: new Map(), identifiers: new Map(), jsonSchemaImports: new Set() }
	return generateFieldSchema(field(raw), schemaType, { imports }) as string
}

/** The field `raw` as its `schemaType` DTO's generated code builds it */
const written = (raw: string, schemaType: SchemaType = "create"): z.ZodType =>
	new Function("z", "comb", "_m", ...Object.keys(SCHEMAS), `return ${codeOf(raw, schemaType)}`)(
		z,
		comb,
		SHARED_META,
		...Object.values(SCHEMAS),
	) as z.ZodType

/** `node` without its examples, which a field's example meta adds at each level */
function withoutExamples(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(withoutExamples)
	if (node === null || typeof node !== "object") return node
	return Object.fromEntries(
		Object.entries(node)
			.filter(([key]) => key !== "examples" && key !== "$schema")
			.map(([key, value]) => [key, withoutExamples(value)]),
	)
}

/** What `schema` publishes on the input side, without `$schema` and examples */
const publishedOf = (schema: z.ZodType) =>
	withoutExamples(z.toJSONSchema(schema, { io: "input" })) as Record<string, unknown>

describe("an enum's format (plan 24)", () => {
	it.each(["read", "readPartial", "create", "update"] as const)("publishes its values and the format on %s", (type) => {
		const currency = written('c.enum("f", ["USD", "EUR", "GBP"], { format: "iso4217" }).notNull()', type)
		expect(publishedOf(currency)).toEqual({ enum: ["USD", "EUR", "GBP"], type: "string", "x-comb-format": "iso4217" })
		expect(currency.safeParse("usd").success).toBe(false)
	})
})

describe("a nullable format text (plan 24)", () => {
	const BCP47 = 'c.text("f", { format: "bcp47" })'

	it("takes null and holds a value to the format", () => {
		const tag = written(BCP47)
		expect(tag.parse(null)).toBeNull()
		expect(tag.parse(" zh-Hant-TW ")).toBe("zh-Hant-TW")
		expect(tag.parse("es-419")).toBe("es-419")
		expect(tag.safeParse("en_HR").error?.issues).toEqual([
			{ code: "invalid_format", format: "bcp47", message: "Invalid bcp47", origin: "string", path: [] },
		])
	})

	it("publishes the format beside its anyOf and on its member, the source on the member alone", () => {
		const published = publishedOf(written(BCP47))
		const member = (published["anyOf"] as Array<Record<string, unknown>>)[0] as Record<string, unknown>
		expect(published).toEqual({
			anyOf: [member, { type: "null" }],
			"x-comb-format": "bcp47",
			"x-comb-transform": ["trim"],
		})
		expect(Object.keys(member).toSorted()).toEqual([
			"minLength",
			"pattern",
			"type",
			"x-comb-format",
			"x-comb-transform",
		])
		expect(member["minLength"]).toBe(2)
	})
})

const ORDER = 'c.text("f", { schema: dateOrder, trim: true })'

describe("a text column's schema (plan 24)", () => {
	it("refuses a value with exactly the issues the schema yields alone", () => {
		expect(written(`${ORDER}.notNull()`).safeParse("x").error?.issues).toEqual(dateOrder.safeParse("x").error?.issues)
	})

	it("runs after comb's rules, on the rewritten value", () => {
		expect(written(`${ORDER}.notNull()`).parse(" iso ")).toBe("iso")
		expect(written(`${ORDER}.notNull()`, "update").parse(" dmy ")).toBe("dmy")
	})

	it("publishes the schema's export and its input JSON Schema in an allOf", () => {
		expect(publishedOf(written(`${ORDER}.notNull()`))).toEqual({
			allOf: [{ enum: ["iso", "dmy", "mdy"], type: "string" }],
			minLength: 1,
			type: "string",
			"x-comb-schema": "dateOrder",
			"x-comb-transform": ["trim"],
			...RULE,
		})
	})
})

describe("a text column's schema on a nullable column, a chain of two patterns, a read and a reference", () => {
	it("takes null on a nullable column, the schema's allOf on its member alone, so null still passes a reader", () => {
		const order = written(ORDER)
		expect(order.parse(null)).toBeNull()
		expect(publishedOf(order)).toEqual({
			anyOf: [
				{
					allOf: [{ enum: ["iso", "dmy", "mdy"], type: "string" }],
					type: "string",
					"x-comb-schema": "dateOrder",
					"x-comb-transform": ["trim"],
					...RULE,
				},
				{ type: "null" },
			],
			"x-comb-schema": "dateOrder",
			"x-comb-transform": ["trim"],
			...RULE,
		})
	})

	it("keeps the published patterns of a chain of two beside the schema's", () => {
		for (const declared of [
			'c.text("f", { email: true, pattern: "/^a/" })',
			'c.text("f", { name: true, pattern: "/^a/" })',
			'c.text("f", { format: "kebab-slug", pattern: "/^a/" })',
			'c.text("f", { format: "iana-time-zone", pattern: "/^E/" })',
		]) {
			const own = publishedOf(written(`${declared}.notNull()`))
			const piped = publishedOf(written(`${declared.replace("{ ", "{ schema: dateOrder, ")}.notNull()`))
			expect(piped, declared).toEqual({
				...own,
				allOf: [...((own["allOf"] ?? []) as unknown[]), { enum: ["iso", "dmy", "mdy"], type: "string" }],
				"x-comb-schema": "dateOrder",
			})
		}
	})

	it("leaves a read without it: a stored row is never refused", () => {
		expect(codeOf(`${ORDER}.notNull()`, "read")).not.toContain("dateOrder")
		expect(written(`${ORDER}.notNull()`, "read").parse("x")).toBe("x")
	})

	it("treats a schema'd text that references an id as its own text, not as an id", () => {
		expect(publishedOf(written('c.text("f", { schema: dateOrder }).references(() => user.id).notNull()'))).toEqual({
			allOf: [{ enum: ["iso", "dmy", "mdy"], type: "string" }],
			minLength: 1,
			type: "string",
			"x-comb-schema": "dateOrder",
			...RULE,
		})
	})
})

describe("a number column's schema (plan 24)", () => {
	const SLOT = 'c.integer("f", { min: 0, schema: evenMinutes }).notNull()'

	it("refuses a value with the schema's own issue, after comb's bounds", () => {
		expect(written(SLOT).safeParse(3).error?.issues).toEqual([{ code: "custom", message: "Must be even", path: [] }])
		expect(written(SLOT).parse(4)).toBe(4)
		expect(written(SLOT).safeParse(-2).error?.issues).toEqual([
			{
				code: "too_small",
				inclusive: true,
				message: "Too small: expected number to be >=0",
				minimum: 0,
				origin: "number",
				path: [],
			},
		])
	})

	it("publishes the schema's export and its input JSON Schema in an allOf", () => {
		expect(publishedOf(written(SLOT))).toEqual({
			allOf: [field(SLOT).schemaJson],
			maximum: Number.MAX_SAFE_INTEGER,
			minimum: 0,
			type: "integer",
			"x-comb-schema": "evenMinutes",
		})
		expect(publishedOf(written('c.real("f", { schema: evenMinutes }).notNull()', "update"))).toEqual({
			allOf: [field(SLOT).schemaJson],
			type: "number",
			"x-comb-schema": "evenMinutes",
		})
	})
})
