import { describe, expect, it } from "vitest"
import { controlEffect } from "./classify-control.ts"

/* PA12 of r23: inside Atlas's transaction a BEGIN starts none, and the rest end Atlas's own */
describe("controlEffect", () => {
	it.each([
		["BEGIN", "starts no transaction, as one is already open"],
		["START TRANSACTION", "starts no transaction, as one is already open"],
		["COMMIT", "ends that transaction"],
		["ROLLBACK", "ends that transaction"],
		["PREPARE TRANSACTION", "ends that transaction"],
	])("says what %s does there", (control, effect) => {
		expect(controlEffect(control)).toBe(effect)
	})
})
