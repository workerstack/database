/* A2-12 of r22, CD4 of r23: a plain SQLite numeric takes what SQLite's NUMERIC reads back as sent */
import * as z from "zod"
import { describe, expect, it } from "vitest"
import { parseField } from "../../__fixtures__/runtime.ts"
import { SQLITE_NUMERIC, sqliteWriteRule } from "./sqlite-types.ts"

const numeric = new Function("z", `return ${SQLITE_NUMERIC}`)(z) as z.ZodType
const takes = (value: string) => numeric.safeParse(value).success

describe("sqliteWriteRule", () => {
	it("gives a plain numeric its digits rule, and no other plain type a rule", () => {
		expect(sqliteWriteRule(parseField("n", 'numeric("n")'))).toBe(SQLITE_NUMERIC)
		expect(sqliteWriteRule(parseField("n", 'text("n")'))).toBeUndefined()
	})

	it("takes a whole number of 15 digits and refuses 16", () => {
		const whole = "7".repeat(15)
		expect([takes(whole), takes(`-${whole}`), takes(`000${whole}`), takes(`7${whole}`)]).toEqual([
			true,
			true,
			true,
			false,
		])
	})

	/* CD4 of r23: SQLite 3.53 writes a REAL of 14 or 15 digits back as another decimal */
	it("takes a fraction of 13 digits split anywhere about the point, and refuses 14", () => {
		for (let whole = 1; whole < 13; whole++) {
			const kept = `${"7".repeat(whole)}.${"7".repeat(13 - whole)}`
			expect([takes(kept), takes(`-${kept}`), takes(`000${kept}`)], kept).toEqual([true, true, true])
			expect([takes(`7${kept}`), takes(`${kept}7`)], `${kept} and one more`).toEqual([false, false])
		}
		/* a whole part of 0 costs no digit */
		expect([takes(`0.${"7".repeat(13)}`), takes(`0.${"7".repeat(14)}`)]).toEqual([true, false])
	})

	it("refuses a spelling SQLite reads as a number, or as text", () => {
		for (const value of ["1e3", "+3", " 12", ".5", "1.", "-", "0x10", "", "1.2.3"])
			expect(takes(value), value).toBe(false)
	})
})
