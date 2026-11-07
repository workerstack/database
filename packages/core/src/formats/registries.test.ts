import { describe, expect, it } from "vitest"
import { isIanaTimeZone } from "./iana-time-zone.ts"
import { isIso3166Alpha2, isIso3166Alpha3 } from "./iso3166-1.ts"
import { isIso4217 } from "./iso4217.ts"
import { isIso639Alpha2 } from "./iso639-1.ts"
import {
	CALENDARS,
	FIRST_DAYS,
	HOUR_CYCLES,
	MEASUREMENT_SYSTEMS,
	MEASUREMENT_UNITS,
	NUMBERING_SYSTEMS,
} from "./uts35.ts"

/* each predicate reads the value exactly as written: a format's trim and case run before it, never inside it */
const PREDICATES = [
	{
		name: "isIso4217",
		predicate: isIso4217,
		/* XAU is a fund-and-metal code the SIX list carries; HRK was withdrawn in 2023 */
		takes: ["EUR", "USD", "XAU"],
		refuses: ["HRK", "eur", "EU", "", " EUR"],
	},
	{
		name: "isIso3166Alpha2",
		predicate: isIso3166Alpha2,
		/* UK is reserved, not assigned: the United Kingdom is GB */
		takes: ["HR", "US", "GB"],
		refuses: ["UK", "hr", "HRV", ""],
	},
	{ name: "isIso3166Alpha3", predicate: isIso3166Alpha3, takes: ["HRV", "USA"], refuses: ["HR", "hrv", ""] },
	{ name: "isIso639Alpha2", predicate: isIso639Alpha2, takes: ["hr", "en"], refuses: ["hrv", "HR", ""] },
	{
		name: "isIanaTimeZone",
		predicate: isIanaTimeZone,
		/* a main-file Zone, a three-part name, an etcetera Zone and two backward Links */
		takes: ["Europe/Zagreb", "America/Argentina/Buenos_Aires", "Etc/GMT+5", "UTC", "US/Pacific"],
		refuses: ["Europe/Atlantis", "europe/zagreb", "Factory", ""],
	},
] as const

describe.each(PREDICATES)("$name", ({ predicate, takes, refuses }) => {
	it.each(takes)("takes %j", (value) => {
		expect(predicate(value)).toBe(true)
	})

	it.each(refuses)("refuses %j", (value) => {
		expect(predicate(value)).toBe(false)
	})
})

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
