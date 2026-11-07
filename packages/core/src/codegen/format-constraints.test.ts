import { describe, expect, it } from "vitest"
import { fieldOf } from "./__fixtures__/runtime.ts"
import { formatOf } from "./format-constraints.ts"

const at = "/fixture/db.core.tables.ts: fixture.f"

/** A thunk that reads a column written as `source`, as codegen reads it */
const reading = (source: string) => () => fieldOf("f", source).constraints

const TEXT_IDS =
	"base64url, bcp47, e164, iana-time-zone, ip, ipv4, ipv6, iso3166-1-alpha-2, iso3166-1-alpha-3, iso4217, iso639-1, kebab-slug, pkce-s256-challenge, rfc1123-hostname, semver, sha256-hex, sha512-hex, srgb-hex, srgb-hex-alpha, ulid, uts35-ca, uts35-fw, uts35-hc, uts35-ms, uts35-mu, uts35-nu, uuid, uuid-v4, uuid-v7"
const INTEGER_IDS = "iso8601-month, iso8601-weekday"

describe("a format's id: one the helper's kind knows", () => {
	it.each([
		['c.text("f", { format: "iso-4217" })', `comb knows no format "iso-4217"; text formats: ${TEXT_IDS}`],
		['c.enum("f", ["USD"], { format: "iso-4217" })', `comb knows no format "iso-4217"; text formats: ${TEXT_IDS}`],
		[
			'c.text("f", { format: "iso8601-weekday" })',
			`c.text takes no format "iso8601-weekday"; text formats: ${TEXT_IDS}`,
		],
		[
			'c.enum("f", ["1"], { format: "iso8601-month" })',
			`c.enum takes no format "iso8601-month"; text formats: ${TEXT_IDS}`,
		],
		['c.integer("f", { format: "iso4217" })', `c.integer takes no format "iso4217"; integer formats: ${INTEGER_IDS}`],
		['c.integer("f", { format: "iso-8601" })', `comb knows no format "iso-8601"; integer formats: ${INTEGER_IDS}`],
	])("refuses %s", (source, said) => {
		expect(reading(source)).toThrow(`${at}: ${said}`)
	})
})

describe("a text format: it sets the case, the trim and the length", () => {
	it.each([
		[
			'c.text("f", { format: "iso4217", lowercase: true })',
			"an iso4217 text takes no lowercase: the format sets its case and trim",
		],
		[
			'c.text("f", { format: "ulid", uppercase: true })',
			"a ulid text takes no uppercase: the format sets its case and trim",
		],
		['c.text("f", { format: "bcp47", trim: true })', "a bcp47 text takes no trim: the format sets its case and trim"],
		['c.text("f", { format: "iso4217", max: 4 })', "max 4 is past iso4217's length 3: the format holds it"],
		['c.text("f", { format: "iso4217", min: 4 })', "min 4 is past iso4217's length 3: no value is both"],
		['c.text("f", { format: "iso4217", min: 2 })', "min 2 is below iso4217's length 3: the format holds it"],
		['c.text("f", { format: "iso4217", max: 2 })', "max 2 is below iso4217's length 3: no value is both"],
		['c.text("f", { format: "e164", max: 20 })', "max 20 is past e164's max length 16: the format holds it"],
		['c.text("f", { format: "e164", min: 17 })', "min 17 is past e164's max length 16: no value is both"],
		['c.text("f", { format: "bcp47", max: 1 })', "max 1 is below bcp47's min length 2: no value is both"],
		['c.text("f", { format: "bcp47", min: 1 })', "min 1 is below bcp47's min length 2: the format holds it"],
	])("refuses %s", (source, said) => {
		expect(reading(source)).toThrow(`${at}: ${said}`)
	})

	it.each([
		'c.text("f", { format: "bcp47", max: 35 })',
		'c.text("f", { format: "bcp47", min: 2, max: 1000 })',
		'c.text("f", { format: "base64url", min: 4, max: 64 })',
		'c.text("f", { format: "iso4217", min: 3, max: 3 })',
		'c.text("f", { format: "e164", min: 8, max: 16 })',
		'c.text("f", { format: "uuid-v7", private: true, trim: false })',
	])("takes a bound that only narrows it: %s", (source) => {
		expect(reading(source)).not.toThrow()
	})
})

describe("an integer format: it sets the range", () => {
	it.each([
		['c.integer("f", { format: "iso8601-weekday", max: 8 })', "max 8 is past iso8601-weekday's 7: the format holds it"],
		[
			'c.integer("f", { format: "iso8601-weekday", min: 0 })',
			"min 0 is below iso8601-weekday's 1: the format holds it",
		],
		['c.integer("f", { format: "iso8601-month", min: 13 })', "min 13 is past iso8601-month's 12: no value is both"],
		['c.integer("f", { format: "iso8601-month", max: 0 })', "max 0 is below iso8601-month's 1: no value is both"],
	])("refuses %s", (source, said) => {
		expect(reading(source)).toThrow(`${at}: ${said}`)
	})

	it("takes a range inside the format's, as declared", () => {
		expect(reading('c.integer("f", { format: "iso8601-weekday", min: 1, max: 5 })')()).toMatchObject({
			format: "iso8601-weekday",
			max: 5,
			min: 1,
		})
	})
})

describe("an enum format: each value one the standard writes", () => {
	it.each([
		[
			'c.enum("f", ["usd", "EUR"], { format: "iso4217" })',
			'"usd" is no iso4217 value; write the standard\'s form, "USD"',
		],
		['c.enum("f", ["USD", "HRK"], { format: "iso4217" })', '"HRK" is no iso4217 value'],
		[
			'c.enum("f", ["h12", "H23"], { format: "uts35-hc" })',
			'"H23" is no uts35-hc value; write the standard\'s form, "h23"',
		],
		[
			'c.enum("f", ["Europe/Zagreb", "europe/paris"], { format: "iana-time-zone" })',
			'"europe/paris" is no iana-time-zone value',
		],
	])("refuses %s", (source, said) => {
		expect(reading(source)).toThrow(`${at}: ${said}`)
	})

	it.each([
		'c.enum("f", ["USD", "EUR"], { format: "iso4217" })',
		'c.enum("f", ["h12", "h23"], { format: "uts35-hc", tenant: true })',
	])("takes values the format takes as written: %s", (source) => {
		expect(reading(source)).not.toThrow()
	})

	it("refuses, from a direct call, an id that is no string, and checks no values it is not given", () => {
		const options = { helper: "enum", place: "t.f" } as const
		expect(() => formatOf({ format: 4217 }, { ...options, values: null })).toThrow(
			`t.f: comb knows no format 4217; text formats: ${TEXT_IDS}`,
		)
		expect(formatOf({ format: "iso4217" }, { ...options, values: null })).toBe("iso4217")
		expect(formatOf({}, { ...options, values: ["usd"] })).toBeNull()
	})
})
