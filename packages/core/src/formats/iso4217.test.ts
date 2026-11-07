import { describe, expect, it } from "vitest"
import { isIso4217 } from "./iso4217.ts"

/* the predicate reads the value exactly as written: a format's trim and case run before it, never inside it */
describe("isIso4217", () => {
	/* XAU is a fund-and-metal code the SIX list carries */
	it.each(["EUR", "USD", "XAU"])("takes %j", (value) => {
		expect(isIso4217(value)).toBe(true)
	})

	/* HRK was withdrawn in 2023 */
	it.each(["HRK", "eur", "EU", "", " EUR"])("refuses %j", (value) => {
		expect(isIso4217(value)).toBe(false)
	})
})
