import { describe, expect, it } from "vitest"
import { DATABASE_NAMESPACE, databaseImport } from "./database-namespace.ts"

describe("database's namespace in generated code (C2 of r17)", () => {
	it("is named by a member of database, never by databaseMeta or a name that ends in database", () => {
		expect(DATABASE_NAMESPACE.test(".refine(database.isStorableText, {")).toBe(true)
		expect(DATABASE_NAMESPACE.test("databaseMeta({ kind })")).toBe(false)
		expect(DATABASE_NAMESPACE.test("xdatabase.x")).toBe(false)
	})

	it("is imported whole from where database is imported", () => {
		expect(databaseImport("@workerstack/database")).toBe('import * as database from "@workerstack/database"')
	})
})
