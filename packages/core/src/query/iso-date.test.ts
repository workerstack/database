import { describe, expect, it } from "vitest"
import { IsoInstant, isoInstant } from "./iso-date.ts"

/* Q5 of the 0.14.1 review; the field-level cases are filter-validate.fields.test.ts's */
describe("isoInstant", () => {
	it("reads every spelling of one instant as one, a bare date as midnight UTC", () => {
		for (const raw of ["2024-01-01", "2024-01-01T00:00Z", "2024-01-01T01:30+01:30", "2023-12-31T19:00:00.000-05:00"])
			expect(String(isoInstant(raw)), raw).toBe("2024-01-01T00:00:00.000Z")
	})

	it("names no instant for a day the calendar has not, or text no ISO 8601 date", () => {
		for (const raw of ["2023-02-29", "2024-01-01T23:59:60Z", "2024-01-01T00:00+24:00", "yesterday"])
			expect(isoInstant(raw), raw).toBeUndefined()
	})
})

/* QL3 of r23: a fraction past milliseconds was cut with nothing to say so */
describe("an instant past its millisecond", () => {
	it("keeps its millisecond and text, its fraction in nine digits, and says digits past the millisecond were cut", () => {
		const past = isoInstant("2024-01-01T00:00:00.9995Z")
		expect([past?.ms, past?.text, past?.fraction, past?.cut]).toEqual([
			Date.UTC(2024, 0, 1, 0, 0, 0, 999),
			"2024-01-01T00:00:00.999Z",
			"999500000",
			true,
		])
		expect(isoInstant("2024-01-01T00:00:00.999000Z")?.cut).toBe(false)
		expect(new IsoInstant(1500)).toMatchObject({ cut: false, fraction: "500000000" })
	})

	it("refuses a fraction that is not its millisecond's", () => {
		expect(() => new IsoInstant(1500, "4995")).toThrow(RangeError)
		expect(() => new IsoInstant(1500, "5x")).toThrow(RangeError)
	})
})
