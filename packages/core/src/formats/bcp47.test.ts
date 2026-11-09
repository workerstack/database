import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type * as z from "zod"
import { cleanGeneratedDtos, generatedDtos } from "../../tests/integration/support/dtos.ts"
import { isBcp47 } from "../index.ts"

/* RFC 5646 §2.1 langtags, a private-use tag, and every grandfathered tag, irregular then regular */
const TAKES = [
	"en",
	"en-US",
	"es-419",
	"zh-Hant-TW",
	"sr-Latn-RS",
	"x-private",
	"i-klingon",
	"i-default",
	"en-GB-oed",
	"sgn-BE-FR",
	"art-lojban",
	"cel-gaulish",
	"no-bok",
	"zh-guoyu",
	"zh-hakka",
	"zh-min-nan",
]

/* an underscore, a dangling separator, nothing, a space a column's trim would drop, a 9-letter language */
const REFUSES = ["es_419", "en-", "", " en"]
const OVER_LENGTH = "abcdefghi"

/* the predicate reads the value exactly as written: a format's trim runs before it, never inside it */
describe("isBcp47", () => {
	it.each(TAKES)("takes %j", (value) => {
		expect(isBcp47(value)).toBe(true)
	})

	it.each(REFUSES)("refuses %j", (value) => {
		expect(isBcp47(value)).toBe(false)
	})

	it("refuses a language subtag over RFC 5646's 8 letters", () => {
		expect(isBcp47(OVER_LENGTH)).toBe(false)
	})

	it("refuses a value that is no string at runtime, without throwing", () => {
		expect(isBcp47(42 as unknown as string)).toBe(false)
		expect(isBcp47(null as unknown as string)).toBe(false)
	})
})

/** Each taken tag with a separator inserted at every position, each of its separators dropped, and each doubled */
function mutations(tag: string): string[] {
	const found: string[] = []
	for (let at = 0; at <= tag.length; at++) found.push(`${tag.slice(0, at)}-${tag.slice(at)}`)
	for (let at = tag.indexOf("-"); at !== -1; at = tag.indexOf("-", at + 1)) {
		found.push(tag.slice(0, at) + tag.slice(at + 1), `${tag.slice(0, at)}-${tag.slice(at)}`)
	}
	return found
}

const DECLARED = `export const row = sqliteTable("row", {
	id: c.id("row"),
	tag: c.text("t", { format: "bcp47" }).notNull(),
})`

/* the column's create schema is what a caller inserting a row is held to: the predicate must answer as it does */
describe('isBcp47 and a format: "bcp47" column', () => {
	let insert: z.ZodObject
	beforeAll(async () => {
		insert = (await generatedDtos("is-bcp47", DECLARED))["row"]?.["rowDtoCreateSchema"] as z.ZodObject
	})
	afterAll(() => cleanGeneratedDtos())

	/* the trim runs in the column alone, so a value it would change is no case the two share */
	const strings = [...new Set([...TAKES, ...REFUSES, OVER_LENGTH, ...TAKES.flatMap(mutations)])].filter(
		(value) => value.trim() === value,
	)

	it("agree on every case and on each taken tag's separator mutations", () => {
		const answers = strings.map((value) => [value, insert.safeParse({ tag: value }).success] as const)
		expect(answers.map(([value]) => [value, isBcp47(value)])).toEqual(answers)
		/* the set holds both answers, so the agreement sees the column take and refuse */
		expect(new Set(answers.map(([, taken]) => taken))).toEqual(new Set([true, false]))
	})

	it("agree on a value that is no string", () => {
		expect(insert.safeParse({ tag: 42 }).success).toBe(false)
		expect(isBcp47(42 as unknown as string)).toBe(false)
	})
})
