import { describe, expect, it } from "vitest"
import {
	CALENDARS,
	FIRST_DAYS,
	HOUR_CYCLES,
	MEASUREMENT_SYSTEMS,
	MEASUREMENT_UNITS,
	NUMBERING_SYSTEMS,
} from "./uts35.ts"

describe("uts35", () => {
	it("holds the hour cycles CLDR lists", () => {
		expect([...HOUR_CYCLES].sort()).toEqual(["c12", "c24", "h11", "h12", "h23", "h24"])
	})

	it("holds the seven first days", () => {
		expect([...FIRST_DAYS].sort()).toEqual(["fri", "mon", "sat", "sun", "thu", "tue", "wed"])
	})

	it("holds the calendars without the deprecated ones", () => {
		expect(CALENDARS).toContain("gregory")
		expect(CALENDARS).toContain("islamic-umalqura")
		expect(CALENDARS).not.toContain("islamicc")
	})

	it("holds the measurement systems and units", () => {
		expect([...MEASUREMENT_SYSTEMS].sort()).toEqual(["metric", "uksystem", "ussystem"])
		expect([...MEASUREMENT_UNITS].sort()).toEqual(["celsius", "fahrenhe", "kelvin"])
	})

	it("holds the numbering systems", () => {
		expect(NUMBERING_SYSTEMS).toContain("latn")
		expect(NUMBERING_SYSTEMS).toContain("arab")
	})

	it.each([
		["ca", CALENDARS],
		["fw", FIRST_DAYS],
		["hc", HOUR_CYCLES],
		["ms", MEASUREMENT_SYSTEMS],
		["mu", MEASUREMENT_UNITS],
		["nu", NUMBERING_SYSTEMS],
	])("%s lists each value once, sorted, as a lowercase BCP 47 subtag", (_key, values) => {
		expect(new Set(values).size).toBe(values.length)
		expect([...values].sort()).toEqual(values)
		for (const value of values) expect(value).toMatch(/^[a-z0-9]{3,8}(-[a-z0-9]{3,8})*$/u)
	})
})
