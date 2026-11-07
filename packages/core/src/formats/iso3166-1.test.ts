import { describe, expect, it } from "vitest"
import { isIso3166Alpha2, isIso3166Alpha3 } from "./iso3166-1.ts"

/* each predicate reads the value exactly as written: a format's trim and case run before it, never inside it */
describe("isIso3166Alpha2", () => {
	it.each(["HR", "US", "GB"])("takes %j", (value) => {
		expect(isIso3166Alpha2(value)).toBe(true)
	})

	/* UK is reserved, not assigned: the United Kingdom is GB */
	it.each(["UK", "hr", "HRV", ""])("refuses %j", (value) => {
		expect(isIso3166Alpha2(value)).toBe(false)
	})
})

describe("isIso3166Alpha3", () => {
	it.each(["HRV", "USA"])("takes %j", (value) => {
		expect(isIso3166Alpha3(value)).toBe(true)
	})

	it.each(["HR", "hrv", ""])("refuses %j", (value) => {
		expect(isIso3166Alpha3(value)).toBe(false)
	})
})
