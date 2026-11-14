import { describe, expect, it } from "vitest"
import { FILTER_GRAMMAR, DATABASE_META_KEY, DATABASE_META_VERSION } from "./contract.ts"

describe("the meta contract's fixed values", () => {
	it("are the ones docs/meta-contract.md publishes", () => {
		expect({ FILTER_GRAMMAR, DATABASE_META_KEY, DATABASE_META_VERSION }).toEqual({
			FILTER_GRAMMAR: "postgrest",
			DATABASE_META_KEY: "x-database",
			DATABASE_META_VERSION: 1,
		})
	})
})
