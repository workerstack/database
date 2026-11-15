import { describe, expect, it } from "vitest"
import * as z from "zod"
import { createListQuerySchema } from "./list-schema.ts"
import type { ListQueryConfig } from "./schema-types.ts"

/** Each param's published examples, by param */
function examplesOf(schema: z.ZodType): Array<[string, unknown]> {
	const { properties } = z.toJSONSchema(schema, { io: "input" }) as {
		properties: Record<string, { examples?: unknown[] }>
	}
	return Object.entries(properties).flatMap(([key, param]) =>
		(param.examples ?? []).map((value): [string, unknown] => [key, value]),
	)
}

const BASE = {
	filter: { name: "string", size: "number" },
	search: ["name"],
	sort: ["created_at", "name"],
} satisfies ListQueryConfig

/** The published examples of BASE's schema under `config` */
const examplesUnder = (config: Partial<ListQueryConfig>) => examplesOf(createListQuerySchema({ ...BASE, ...config }))

/* QL5 of r23: the published examples ignored the endpoint's own limits, so a client replaying one got a 400 */
describe("every published example passes the schema that publishes it, under its own limits (QL5 of r23)", () => {
	it.each<[string, Partial<ListQueryConfig>]>([
		["the defaults", {}],
		["maxConditions 1", { limits: { maxConditions: 1 } }],
		["maxDepth 0", { limits: { maxDepth: 0 } }],
		["maxValues 1", { limits: { maxValues: 1 } }],
		["maxPatternBytes 1", { limits: { maxPatternBytes: 1 } }],
		["maxSearchTerms 1", { limits: { maxSearchTerms: 1 } }],
		["maxSortKeys 1", { limits: { maxSortKeys: 1 } }],
		["maxPage 1", { pagination: { maxPage: 1 } }],
	])("under %s", (_, config) => {
		const schema = createListQuerySchema({ ...BASE, ...config })
		const examples = examplesOf(schema)
		expect(new Set(examples.map(([key]) => key))).toEqual(new Set(["filter", "limit", "order", "page", "q"]))
		for (const [key, value] of examples)
			expect(schema.safeParse({ [key]: value }).success, `${key}=${value}`).toBe(true)
	})

	it("publishes an or() and a two-word search under the defaults, and neither where the limits refuse them", () => {
		expect(examplesUnder({})).toEqual(
			expect.arrayContaining([
				["filter", "or(name.ilike.*acme*,size.gte.10)"],
				["q", "acme corp"],
				["page", 2],
			]),
		)
		expect(examplesUnder({ limits: { maxConditions: 1 } })).not.toContainEqual([
			"filter",
			"or(name.ilike.*acme*,size.gte.10)",
		])
		expect(examplesUnder({ limits: { maxSearchTerms: 1 } })).not.toContainEqual(["q", "acme corp"])
		expect(examplesUnder({ pagination: { maxPage: 1 } })).not.toContainEqual(["page", 2])
	})

	it("refuses at build a search no q could meet, and a filter no condition could", () => {
		expect(() => createListQuerySchema({ ...BASE, limits: { maxSearchTerms: 0 } })).toThrow(
			new TypeError(
				"createListQuerySchema: limits.maxSearchTerms must be a whole number from 1 where search names a field; got 0",
			),
		)
		expect(() => createListQuerySchema({ ...BASE, limits: { maxConditions: 0 } })).toThrow(
			new TypeError(
				"createListQuerySchema: limits.maxConditions must be a whole number from 1 where filter names a field; got 0",
			),
		)
	})

	it("keeps a cap of 0 where nothing it bounds is declared (sibling)", () => {
		expect(() => createListQuerySchema({ limits: { maxConditions: 0, maxSearchTerms: 0 }, sort: ["id"] })).not.toThrow()
	})
})
