import { describe, expect, it } from "vitest"
import { isIso639Alpha2 } from "./iso639-1.ts"

/* the predicate reads the value exactly as written: a format's trim and case run before it, never inside it */
describe("isIso639Alpha2", () => {
	it.each(["hr", "en"])("takes %j", (value) => {
		expect(isIso639Alpha2(value)).toBe(true)
	})

	it.each(["hrv", "HR", ""])("refuses %j", (value) => {
		expect(isIso639Alpha2(value)).toBe(false)
	})
})
