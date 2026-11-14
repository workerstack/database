/**
 * Plan 24: a text format's DTO normalizes to the standard's case and trim, then holds the value to
 * its source and its pinned registry, one invalid_format issue with no message of database's when it
 * fails, and publishes the format, its transforms, its source and its bounds. Read through the
 * text base, as the generated field writes it.
 */
import { describe, expect, it } from "vitest"
import * as z from "zod"
import * as database from "../../../index.ts"
import { parseField } from "../../__fixtures__/runtime.ts"
import type { FieldMeta, ImportsMeta } from "../../analyzer-types.ts"
import type { Build } from "./build-types.ts"
import type { SchemaType } from "./dto-types.ts"
import { textBase, textRules } from "./text-schema.ts"

/** The text schema of `raw` in a `schemaType` DTO, its keys after the code as the field writes them */
function text(raw: string, schemaType: SchemaType, over: Partial<FieldMeta> & { dialect?: Build["dialect"] } = {}) {
	const { dialect = "sqlite", ...pinned } = over
	const field = { ...parseField("t", raw), ...pinned }
	const imports: ImportsMeta = { enumImports: new Map(), identifiers: new Map(), jsonSchemaImports: new Set() }
	const { code, keys } = textBase({ annotations: field.constraints, dialect, field, imports, schemaType })
	return Object.keys(keys).length === 0 ? code : `${code}.meta(${JSON.stringify(keys)})`
}

/* generated code under database's real root namespace, so a registry predicate it names is one database exports */
const run = (code: string) => new Function("z", "database", `return ${code}`)(z, database) as z.ZodType

/** `raw`'s written field in a create DTO, built */
const created = (raw: string) => run(text(raw, "create"))

/** What `code`'s schema publishes on the input side, its `$schema` key dropped */
function publishedOf(code: string): Record<string, unknown> {
	const { $schema: _, ...rest } = z.toJSONSchema(run(code), { io: "input" })
	return rest
}

/** The issues `value` gets from `schema`, none when it parses */
const issuesOf = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues

/** The one issue a format's DTO yields: zod's invalid_format with the id, worded by zod's locale */
const formatIssue = (format: string, message = `Invalid ${format}`) => [
	{ code: "invalid_format", format, message, origin: "string", path: [] },
]

const CURRENCY = 'c.text("t", { format: "iso4217" })'

describe("a text format's check", () => {
	it("rewrites a value to the standard's form and takes it", () => {
		expect(created(CURRENCY).parse(" eur ")).toBe("EUR")
		expect(run(text('c.text("t", { format: "uts35-hc" })', "update")).parse(" H23 ")).toBe("h23")
		expect(created('c.text("t", { format: "iana-time-zone" })').parse("America/Argentina/Buenos_Aires")).toBe(
			"America/Argentina/Buenos_Aires",
		)
	})

	it("refuses a value off the source or the registry with exactly zod's invalid_format issue", () => {
		expect(issuesOf(created(CURRENCY), "HRK")).toEqual(formatIssue("iso4217"))
		expect(issuesOf(created(CURRENCY), " eu ")).toEqual(formatIssue("iso4217"))
		expect(issuesOf(created('c.text("t", { format: "iana-time-zone" })'), "Europe/Atlantis")).toEqual(
			formatIssue("iana-time-zone"),
		)
		expect(issuesOf(created('c.text("t", { format: "uts35-hc" })'), "x")).toEqual(formatIssue("uts35-hc"))
		expect(issuesOf(created('c.text("t", { format: "semver" })'), `1.0.0-${"a".repeat(251)}`)).toEqual(
			formatIssue("semver"),
		)
	})

	it("leaves the issue's words to zod's locale", () => {
		try {
			z.config(z.locales.de())
			expect(issuesOf(created(CURRENCY), "HRK")).toEqual(formatIssue("iso4217", "Ungültig: iso4217"))
		} finally {
			z.config(z.locales.en())
		}
	})
})

describe("what a text format publishes", () => {
	it("is the format, its transforms, its source and its bounds", () => {
		expect(publishedOf(text(CURRENCY, "create"))).toEqual({
			maxLength: 3,
			minLength: 3,
			pattern: "^[A-Z]{3}$",
			type: "string",
			"x-database-format": "iso4217",
			"x-database-transform": ["trim", "uppercase"],
		})
		expect(publishedOf(text('c.text("t", { format: "uts35-hc" })', "update"))).toEqual({
			maxLength: 3,
			minLength: 3,
			pattern: "^(?:c12|c24|h11|h12|h23|h24)$",
			type: "string",
			"x-database-format": "uts35-hc",
			"x-database-transform": ["trim", "lowercase"],
		})
		expect(publishedOf(text('c.text("t", { format: "iana-time-zone" })', "create"))).toEqual({
			maxLength: 64,
			minLength: 1,
			pattern: "^[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+){0,2}$",
			type: "string",
			"x-database-format": "iana-time-zone",
			"x-database-transform": ["trim"],
		})
	})

	it("is the format's, not an id's, on a format text that references an id", () => {
		expect(publishedOf(text('c.text("t", { format: "uuid-v7" }).references(() => user.id)', "create"))).toEqual({
			maxLength: 36,
			minLength: 36,
			pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
			type: "string",
			"x-database-format": "uuid-v7",
			"x-database-transform": ["trim", "lowercase"],
		})
	})

	it("is nothing of the format's on a read: a stored row is never refused", () => {
		expect(text(CURRENCY, "read")).toBe("z.string()")
		expect(text(CURRENCY, "readPartial")).toBe("z.string()")
	})
})

describe("a text format beside declared bounds and a pattern", () => {
	it("holds a tighter declared bound with zod's own issue, and publishes it", () => {
		expect(issuesOf(created('c.text("t", { format: "bcp47", max: 10 })'), "en-Latn-HR-x-abc")).toEqual([
			{
				code: "too_big",
				inclusive: true,
				maximum: 10,
				message: "Too big: expected string to have <=10 characters",
				origin: "string",
				path: [],
			},
		])
		expect(publishedOf(text('c.text("t", { format: "bcp47", max: 10 })', "create"))).toMatchObject({
			maxLength: 10,
			minLength: 2,
		})
		expect(publishedOf(text('c.text("t", { format: "base64url", min: 4 })', "create"))).toMatchObject({ minLength: 4 })
		expect(publishedOf(text('c.text("t", { format: "base64url", min: 4 })', "create"))).not.toHaveProperty("maxLength")
	})

	it("takes an empty base64url on a required column, the format's own floor of 0", () => {
		const required = 'c.text("t", { format: "base64url" }).notNull()'
		expect(created(required).parse("")).toBe("")
		const field = parseField("t", required)
		expect(textRules(field.constraints, field)).toEqual({
			max: null,
			min: null,
			patterns: ["/^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/u"],
		})
	})

	it("publishes a declared pattern beside the format's source, and holds the value to both", () => {
		const slug = 'c.text("t", { format: "kebab-slug", pattern: "/^a/" })'
		expect(publishedOf(text(slug, "create"))).toMatchObject({
			allOf: [{ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }],
			pattern: "^a",
		})
		expect(issuesOf(created(slug), "a--b")).toEqual(formatIssue("kebab-slug"))
		expect(created(slug).safeParse("b-c").success).toBe(false)
		expect(created(slug).parse("a-c")).toBe("a-c")
	})

	it("states the manifest's rules from the format: its range, its source, then the declared pattern, as the chain checks them", () => {
		const field = parseField("t", 'c.text("t", { format: "iso4217", pattern: "/^E/" })')
		expect(textRules(field.constraints, field)).toEqual({ max: 3, min: 3, patterns: ["/^[A-Z]{3}$/u", "/^E/u"] })
	})

	it("fails codegen for a column length the format's values do not fit", () => {
		expect(() => text(CURRENCY, "create", { dialect: "postgres", length: 2 })).toThrow(
			"t: its length min 3 and max 2 leave no value; widen them",
		)
	})
})
