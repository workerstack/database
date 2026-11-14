import { describe, expect, it } from "vitest"
import type { EnumOptions } from "../sqlite/constraints.ts"
import { columnMeta, enumMeta, withColumn } from "./column.ts"

describe("withColumn and columnMeta", () => {
	it("records the options a helper was given on the builder's config, and leaves out the rest", () => {
		const builder = { config: {} }
		expect(withColumn(builder, { constraints: undefined, kind: "text", prefix: undefined })).toBe(builder)
		expect(columnMeta(builder)).toEqual({ kind: "text" })
		/* under the registered symbol, so another copy of database reads it */
		expect(Object.getOwnPropertySymbols(builder.config).map((symbol) => Symbol.keyFor(symbol))).toEqual([
			"database.column",
		])
	})

	it("reads nothing from a value with no config, or a config no c helper wrote", () => {
		for (const value of [undefined, null, {}, { config: {} }]) expect(columnMeta(value)).toBeUndefined()
	})
})

describe("enumMeta", () => {
	const values = ["draft", "live"] as const
	const states = (options: EnumOptions<"draft" | "live">) => enumMeta(values, options).states

	it("reads a state set to undefined as one left out, so an enum given none records no machine", () => {
		expect(
			enumMeta(values, { initial: undefined, terminal: undefined, transitions: undefined } as EnumOptions),
		).toEqual(enumMeta(values))
		expect(states({ initial: undefined, nomutate: true })).toBeUndefined()
		expect(states({ initial: "draft", nomutate: true, terminal: undefined })).toEqual({ initial: "draft" })
	})

	it("keeps a machine given alone as the very object passed", () => {
		const machine: EnumOptions<"draft" | "live"> = { initial: "draft", terminal: ["live"] }
		expect(states(machine)).toBe(machine)
	})
})
