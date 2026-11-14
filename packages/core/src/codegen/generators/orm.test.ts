import { fixtureRoot } from "../__fixtures__/temp.ts"
import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as z from "zod"
import { tableOf } from "../__fixtures__/runtime.ts"
import { generateOrm } from "./orm.ts"
import { testContext } from "./__fixtures__/context.ts"

type Config = Omit<Parameters<typeof generateOrm>[1], "dialect" | "driver" | "output"> & {
	dialect: string
	driver: string
}

let tmpDir: string

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(fixtureRoot(), "database-gen-orm-"))
})

afterEach(() => {
	fs.rmSync(tmpDir, { force: true, recursive: true })
})

/** Generate the client for the tables file `db.<dbName>.tables.ts` and return it with what was logged */
function generate(config: Config, dbName = "core"): { content: string; logged: string[] } {
	const tablesPath = path.join(tmpDir, `db.${dbName}.tables.ts`)
	fs.writeFileSync(tablesPath, "")
	const ctx = testContext([], { cwd: tmpDir, dbName, tablesPath })
	generateOrm(ctx, { ...config, output: "orm.gen.ts" } as Parameters<typeof generateOrm>[1])
	return { content: fs.readFileSync(path.join(tmpDir, "orm.gen.ts"), "utf-8"), logged: ctx.logged }
}

describe("generateOrm — sqlite drivers", () => {
	it("generates a D1 client and says where it wrote it", () => {
		const { content, logged } = generate({ dialect: "sqlite", driver: "d1" })
		for (const part of ["createCoreDb", "d1: AnyD1Database", "drizzle-orm/d1", "type CoreDb", "type CoreSchema"]) {
			expect(content).toContain(part)
		}
		expect(logged).toEqual([`Generated ORM client: ${path.join(tmpDir, "orm.gen.ts")}`])
	})

	it("generates a Turso client with an isolate cache", () => {
		const { content } = generate({ dialect: "sqlite", driver: "turso" }, "auth")
		for (const part of [
			"createAuthDb",
			"createAuthDbHttp",
			"createAuthDbWeb",
			"authDbIsolateCache",
			"@libsql/client",
		]) {
			expect(content).toContain(part)
		}
	})

	it("generates a libsql client", () => {
		const { content } = generate({ dialect: "sqlite", driver: "libsql" }, "local")
		expect(content).toContain("createLocalDb")
		expect(content).toContain("createClient")
	})

	it("generates a bun:sqlite client taking a file path", () => {
		const { content } = generate({ dialect: "sqlite", driver: "bun-sqlite" })
		expect(content).toContain(`import { Database } from "bun:sqlite"`)
		expect(content).toContain("drizzle-orm/bun-sqlite")
		expect(content).toContain("createCoreDb(path: string)")
		expect(content).toContain("new Database(path)")
	})
})

describe("generateOrm — postgres drivers", () => {
	it("generates a Neon client with HTTP and pool factories", () => {
		const { content } = generate({ dialect: "postgres", driver: "neon" }, "analytics")
		expect(content).toContain("createAnalyticsDbHttp")
		expect(content).toContain("createAnalyticsDbPool")
		expect(content).toContain("@neondatabase/serverless")
	})
})

describe("generateOrm — the drivers the README documents", () => {
	const readme = fs.readFileSync(path.resolve(import.meta.dirname, "../../../../../README.md"), "utf8")
	const comment = /driver: "d1", \/\/ (.+)\n/.exec(readme)?.[1] ?? ""
	const documented = [...comment.matchAll(/[a-z0-9-]+(?= \||$| \()/g)].map((m) => m[0])

	it.each(documented)("generates a client for %s", (driver) => {
		const dialect = ["neon", "node-postgres", "postgres-js"].includes(driver) ? "postgres" : "sqlite"
		expect(generate({ dialect, driver }).content).toContain("@generated")
	})

	it("reads the documented list", () => {
		expect(documented.length).toBeGreaterThan(0)
	})
})

describe("generateOrm — where relations are imported from", () => {
	it("defaults to the tables file's relations sibling", () => {
		expect(generate({ dialect: "sqlite", driver: "d1" }).content).toContain('from "./db.core.relations.gen"')
	})

	it("uses the configured file prefix", () => {
		const { content } = generate({ dialect: "sqlite", driver: "d1", filePrefix: "app.db-core" })
		expect(content).toContain('import { relations } from "./app.db-core.relations.gen"')
	})

	it("prefers an explicit relations output over the prefix", () => {
		const { content } = generate({
			dialect: "sqlite",
			driver: "d1",
			filePrefix: "app.db-core",
			relationsOutput: "./src/custom.relations.gen.ts",
		})
		expect(content).toContain('import { relations } from "./src/custom.relations.gen"')
	})
})

describe("generateOrm — refusals", () => {
	it.each([
		[{ dialect: "sqlite", driver: "better-sqlite3" }, /Unsupported SQLite driver: better-sqlite3/],
		[{ dialect: "postgres", driver: "mystery" }, /Unsupported Postgres driver: mystery/],
		[{ dialect: "mysql", driver: "d1" }, /Unsupported dialect: mysql/],
	])("refuses %j by name and writes nothing", (config, message) => {
		expect(() => generate(config)).toThrow(message)
		expect(fs.existsSync(path.join(tmpDir, "orm.gen.ts"))).toBe(false)
	})
})

/* plan 24: a text or number column's schema is a DTO rule; the client types its tables from the tables module alone */
describe("generateOrm — a column schema", () => {
	it("imports no text or number column's schema", () => {
		const dateOrder = z.enum(["iso", "dmy"])
		const table = tableOf("user", { order: 'c.text("order", { schema: dateOrder })' }, { scope: { dateOrder } })
		expect(table.fields[0]?.schemaImports.map((ref) => ref.imported)).toEqual(["dateOrder"])
		const tablesPath = path.join(tmpDir, "db.core.tables.ts")
		fs.writeFileSync(tablesPath, "")
		const ctx = testContext([table], { cwd: tmpDir, dbName: "core", tablesPath })
		generateOrm(ctx, { dialect: "sqlite", driver: "d1", output: "orm.gen.ts" })
		const imports = fs
			.readFileSync(path.join(tmpDir, "orm.gen.ts"), "utf-8")
			.split("\n")
			.filter((line) => line.startsWith("import"))
		expect(imports).toEqual([
			'import type { AnyD1Database } from "drizzle-orm/d1"',
			'import { drizzle } from "drizzle-orm/d1"',
			'import { relations } from "./db.core.relations.gen"',
			'import type * as coreDbSchema from "./db.core.tables"',
		])
	})
})
