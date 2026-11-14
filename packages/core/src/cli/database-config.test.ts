import { fixtureRoot } from "../codegen/__fixtures__/temp.ts"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { makeIo, projects, writeTables } from "./__fixtures__/io.ts"
import {
	databaseIn,
	declaredFts,
	findDatabaseConfig,
	ftsSql,
	loadDatabaseConfig,
	tablesFile,
} from "./database-config.ts"
import { CliError } from "./output.ts"

const temp = projects(fixtureRoot())
const project = temp.make
afterEach(temp.clean)

describe("findDatabaseConfig and loadDatabaseConfig", () => {
	it("reads database.config.ts, then database.config.js, by default or namespace export", async () => {
		const ts = project()
		writeFileSync(join(ts, "database.config.ts"), 'export default { databases: { core: { tables: "./a.ts" } } }\n')
		expect(await findDatabaseConfig(ts)).toEqual({ databases: { core: { tables: "./a.ts" } } })
		const js = project()
		writeFileSync(join(js, "database.config.js"), 'export const databases = { core: { tables: "./b.ts" } }\n')
		expect((await loadDatabaseConfig(js)).databases).toEqual({ core: { tables: "./b.ts" } })
	})

	it("finds nothing in a project without one, and loading it then is an error", async () => {
		const empty = project()
		expect(await findDatabaseConfig(empty)).toBeUndefined()
		await expect(loadDatabaseConfig(empty)).rejects.toThrow(CliError)
	})
})

/* KC7 of r22b: a database.config.ts that failed to load was reported without its file */
describe("findDatabaseConfig on a config that fails to load", () => {
	it("names the file, with the error as its cause", async () => {
		const broken = project()
		writeFileSync(join(broken, "database.config.ts"), "export default {\n")
		await expect(findDatabaseConfig(broken)).rejects.toThrow(`${join(broken, "database.config.ts")} failed to load: `)
		const throws = project()
		writeFileSync(join(throws, "database.config.ts"), 'throw new RangeError("store unreachable")\n')
		const thrown = await findDatabaseConfig(throws).catch((error: unknown) => error)
		expect(thrown).toBeInstanceOf(CliError)
		expect((thrown as Error).message).toBe(`${join(throws, "database.config.ts")} failed to load: store unreachable`)
		expect((thrown as Error).cause).toEqual(new RangeError("store unreachable"))
		const value = project()
		writeFileSync(join(value, "database.config.ts"), "throw 7\n")
		await expect(findDatabaseConfig(value)).rejects.toThrow(`${join(value, "database.config.ts")} failed to load: 7`)
	})
})

/* K14 of the 0.15.0 review: a misspelled key fell back to its default, and codegen exited 0 */
describe("findDatabaseConfig on a config with a key database does not know", () => {
	it("refuses it by name, naming the file and where", async () => {
		const dir = project()
		writeFileSync(
			join(dir, "database.config.ts"),
			'export default { databases: { core: { tables: "./a.ts", filePrefx: "db.x" } } }\n',
		)
		await expect(findDatabaseConfig(dir)).rejects.toThrow(
			`${join(dir, "database.config.ts")} is not a valid database config:\n✖ Unrecognized key: "filePrefx"\n  → at databases.core`,
		)
	})

	it("refuses a generator database does not have, and a driver it does not write", async () => {
		const dir = project()
		writeFileSync(
			join(dir, "database.config.ts"),
			'export default { databases: { core: { tables: "./a.ts", generators: ["dto"], driver: "pg" } } }\n',
		)
		await expect(findDatabaseConfig(dir)).rejects.toThrow(
			/→ at databases\.core\.driver[\s\S]*→ at databases\.core\.generators\[0\]|→ at databases\.core\.generators\[0\][\s\S]*→ at databases\.core\.driver/,
		)
	})
})

describe("databaseIn and tablesFile", () => {
	it("returns the declared database, and names the declared ones when it is not there", () => {
		const config = { databases: { core: { tables: "t.ts" } } }
		expect(databaseIn(config, "core")).toEqual({ tables: "t.ts" })
		expect(() => databaseIn(config, "nope")).toThrow('database.config.ts declares no database "nope". Available: core')
		expect(() => databaseIn(config, "toString")).toThrow(CliError)
	})

	it("resolves a tables file against the project, and refuses one that is missing", () => {
		const dir = project()
		const file = writeTables(dir)
		expect(tablesFile(dir, "db.core.tables.ts", "tables")).toBe(file)
		expect(() => tablesFile(dir, "gone.ts", "tables")).toThrow(`Tables file not found: ${join(dir, "gone.ts")}`)
	})
})

describe("declaredFts and ftsSql", () => {
	it("declares no FTS without a config, a database name, or fts on the database", async () => {
		const dir = project()
		expect(await declaredFts(dir, { name: "core" })).toBeUndefined()
		writeFileSync(
			join(dir, "database.config.ts"),
			'export default { databases: { core: { tables: "./db.core.tables.ts", fts: {} } } }\n',
		)
		expect(await declaredFts(dir, { name: undefined })).toBeUndefined()
		expect(await declaredFts(dir, { name: "core" })).toBeUndefined()
		await expect(declaredFts(dir, { hint: "Set codegen", name: "gone" })).rejects.toThrow(". Set codegen")
	})

	it("is the FTS the database declares, and the FTS5 DDL built from it", async () => {
		const dir = project()
		writeTables(dir)
		writeFileSync(
			join(dir, "database.config.ts"),
			'export default { databases: { core: { tables: "./db.core.tables.ts", fts: { post: { columns: ["title"] } } } } }\n',
		)
		const declared = await declaredFts(dir, { name: "core" })
		expect(declared).toEqual({ fts: { post: { columns: ["title"] } }, tables: "./db.core.tables.ts" })
		expect(await ftsSql(dir, declared as NonNullable<typeof declared>, makeIo(dir))).toMatch(
			/CREATE VIRTUAL TABLE IF NOT EXISTS "post_fts" USING fts5/,
		)
	})
})
