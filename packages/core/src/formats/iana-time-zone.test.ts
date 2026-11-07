import { describe, expect, it } from "vitest"
import { isIanaTimeZone } from "./iana-time-zone.ts"

/* the predicate reads the value exactly as written: a format's trim and case run before it, never inside it */
describe("isIanaTimeZone", () => {
	/* a main-file Zone, a three-part name, an etcetera Zone and two backward Links */
	it.each(["Europe/Zagreb", "America/Argentina/Buenos_Aires", "Etc/GMT+5", "UTC", "US/Pacific"])(
		"takes %j",
		(value) => {
			expect(isIanaTimeZone(value)).toBe(true)
		},
	)

	it.each(["Europe/Atlantis", "europe/zagreb", "Factory", ""])("refuses %j", (value) => {
		expect(isIanaTimeZone(value)).toBe(false)
	})
})
