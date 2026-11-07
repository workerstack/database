import { describe, expect, it } from "vitest"
import * as z from "zod"
import { parseField } from "../../__fixtures__/runtime.ts"
import type { ImportsMeta } from "../../analyzer-types.ts"
import type { SchemaType } from "./dto-types.ts"
import { generateFieldSchema } from "./field-schema.ts"
import { numberRules } from "./number-range.ts"

const SAFE = { max: Number.MAX_SAFE_INTEGER, min: Number.MIN_SAFE_INTEGER }

/* C2 of r20: the bounds a written number takes, which the manifest states as the DTO checks them */
describe("numberRules", () => {
	it.each([
		{ dialect: "sqlite", name: "a boolean", raw: 'c.boolean("f")', rules: { max: null, min: null } },
		{ dialect: "sqlite", name: "a timestamp comb fills", raw: 'c.createdAt("f")', rules: { max: null, min: null } },
		{ dialect: "sqlite", name: "a written timestamp, a JS number's exact range", raw: 'c.timestamp("f")', rules: SAFE },
		{
			dialect: "sqlite",
			name: "an integer on sqlite, its declared max",
			raw: 'c.integer("f", { max: 9 })',
			rules: { max: 9, min: SAFE.min },
		},
		{
			dialect: "postgres",
			name: "an integer on postgres, in int4",
			raw: 'c.integer("f", { min: 0 })',
			rules: { max: 2147483647, min: 0 },
		},
		{
			dialect: "postgres",
			name: "an integer's declared bound past int4, clamped",
			raw: 'c.integer("f", { max: 1e12 })',
			rules: { max: 2147483647, min: -2147483648 },
		},
		{
			dialect: "sqlite",
			name: "an integer format's range, plan 24",
			raw: 'c.integer("f", { format: "iso8601-weekday" })',
			rules: { max: 7, min: 1 },
		},
		{
			dialect: "postgres",
			name: "an integer format's range under a tighter declared max",
			raw: 'c.integer("f", { format: "iso8601-month", max: 6 })',
			rules: { max: 6, min: 1 },
		},
		{
			dialect: "sqlite",
			name: "a float, as declared",
			raw: 'c.real("f", { min: 0.5 })',
			rules: { max: null, min: 0.5 },
		},
	] as const)("$name", ({ dialect, raw, rules }) => {
		expect(numberRules(parseField("f", raw, { dialect }), dialect)).toEqual(rules)
	})
})

/* the example meta a generated field names from the shared file, as `_m` */
const SHARED_META = { integer: { examples: [42] } }

/** The field `raw` as its `schemaType` DTO's generated code builds it */
function written(raw: string, schemaType: SchemaType = "create"): z.ZodType {
	const imports: ImportsMeta = { enumImports: new Map(), identifiers: new Map(), jsonSchemaImports: new Set() }
	const code = generateFieldSchema(parseField("f", raw), schemaType, { imports }) as string
	return new Function("z", "_m", `return ${code}`)(z, SHARED_META) as z.ZodType
}

/** What `schema` publishes on the input side, its `$schema` and its example dropped */
function publishedOf(schema: z.ZodType): Record<string, unknown> {
	const { $schema: _, examples: __, ...rest } = z.toJSONSchema(schema, { io: "input" })
	return rest
}

/** A required weekday's written field */
const weekday = () => written('c.integer("f", { format: "iso8601-weekday" }).notNull()')

/* plan 24: an integer format's range joins the declared bounds, the tighter winning, and zod's own issues hold it */
describe("an integer format's DTO", () => {
	it("refuses a number past the standard's range with zod's own issue", () => {
		expect(weekday().safeParse(0).error?.issues).toEqual([
			{
				code: "too_small",
				inclusive: true,
				message: "Too small: expected number to be >=1",
				minimum: 1,
				origin: "number",
				path: [],
			},
		])
		expect(weekday().safeParse(8).error?.issues).toEqual([
			{
				code: "too_big",
				inclusive: true,
				maximum: 7,
				message: "Too big: expected number to be <=7",
				origin: "number",
				path: [],
			},
		])
		expect(weekday().parse(1)).toBe(1)
	})

	it("publishes the range and the format, and a tighter declared bound", () => {
		expect(publishedOf(weekday())).toEqual({
			maximum: 7,
			minimum: 1,
			type: "integer",
			"x-comb-format": "iso8601-weekday",
		})
		expect(publishedOf(written('c.integer("f", { format: "iso8601-weekday", max: 5 }).notNull()', "update"))).toEqual({
			maximum: 5,
			minimum: 1,
			type: "integer",
			"x-comb-format": "iso8601-weekday",
		})
	})

	it("leaves a read as any integer's: what the column holds, the declared bounds stated", () => {
		expect(publishedOf(written('c.integer("f", { format: "iso8601-weekday" }).notNull()', "read"))).toEqual({
			maximum: Number.MAX_SAFE_INTEGER,
			minimum: Number.MIN_SAFE_INTEGER,
			type: "integer",
		})
	})
})
