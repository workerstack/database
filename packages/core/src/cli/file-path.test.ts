/**
 * KC6 of r23: a path the CLI or a config names reaches the filesystem only as the kind it must be.
 * A diff name holding a path, a tables path that is a directory and a wranglerConfig that is a
 * directory are each refused by name before anything runs, where they surfaced as an
 * ENOENT in a scratch directory, an EISDIR at an `[eval]` location, or a binding wrangler's config lacks.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { fakeD1, writeSum } from "./__fixtures__/d1.ts"
import { diffProject, fakeAtlas } from "./__fixtures__/diff.ts"
import { makeIo, projects, runCliWithFakes } from "./__fixtures__/io.ts"

const temp = projects()
afterEach(temp.clean)

describe("migrate diff's migration name", () => {
	it.each(["../escape", "sub/name", "sub\\name", "..", "."])(
		"refuses %s, which names a path, with the usage, before Atlas runs",
		async (name) => {
			const dir = diffProject(temp.make)
			const run = fakeAtlas((replayed) => writeFileSync(join(replayed, "20260101000000_x.sql"), "SELECT 1;\n"))
			const io = makeIo(dir, run)
			expect(await runCliWithFakes(["migrate", "diff", "core", name], io)).toBe(1)
			expect(io.errors).toEqual([
				`Migration name "${name}" names a path: give a name alone, such as add_users\nUsage: database migrate diff <database> [name] [-e <name>] [--dry-run]`,
			])
			expect({ calls: run.calls, files: readdirSync(dir) }).toEqual({ calls: [], files: ["drizzle.config.ts"] })
		},
	)

	it("takes a name with a space or a dot inside it", async () => {
		const dir = diffProject(temp.make)
		const io = makeIo(
			dir,
			fakeAtlas((replayed) => writeFileSync(join(replayed, "20260101000000_x.sql"), "SELECT 1;\n")),
		)
		expect(await runCliWithFakes(["migrate", "diff", "core", "add users.v2"], io)).toBe(0)
	})
})

/** A project whose src is a directory, with database.config.ts declaring core's tables as `tables` */
function tablesProject(tables: string): string {
	const dir = temp.make()
	mkdirSync(join(dir, "src"))
	writeFileSync(
		join(dir, "database.config.ts"),
		`export default { databases: { core: { tables: ${JSON.stringify(tables)} } } }\n`,
	)
	return dir
}

describe("codegen's tables path", () => {
	it("refuses --tables naming a directory, by name, writing nothing", async () => {
		const dir = tablesProject("./src")
		const io = makeIo(dir)
		expect(await runCliWithFakes(["codegen", "--tables", "src"], io)).toBe(1)
		expect(io.errors).toEqual([
			`--tables ${join(dir, "src")} is a directory, not a file: point it at the module that exports the tables`,
		])
		expect(readdirSync(dir).sort()).toEqual(["database.config.ts", "src"])
	})

	it("refuses --tables naming what is neither a file nor a directory", async () => {
		const dir = tablesProject("./src")
		const io = makeIo(dir)
		expect(await runCliWithFakes(["codegen", "--tables", "/dev/null"], io)).toBe(1)
		expect(io.errors).toEqual(["--tables /dev/null is not a file: point it at the module that exports the tables"])
	})

	it("refuses database.config.ts tables naming a directory, by name", async () => {
		const dir = tablesProject("./src")
		const io = makeIo(dir)
		expect(await runCliWithFakes(["codegen", "core"], io)).toBe(1)
		expect(io.errors.at(-1)).toBe(
			`tables ${join(dir, "src")} is a directory, not a file: point it at the module that exports the tables`,
		)
	})
})

/** A D1 project whose database.migrate.config.ts names `wranglerConfig`, with a wrangler-dir directory beside it */
function d1Project(wranglerConfig: string): string {
	const dir = temp.make()
	mkdirSync(join(dir, "wrangler-dir"))
	mkdirSync(join(dir, "atlas-migrations"))
	writeFileSync(join(dir, "atlas-migrations", "20260101000000_init.sql"), "CREATE TABLE post (id TEXT);")
	writeSum(join(dir, "atlas-migrations"))
	writeFileSync(
		join(dir, "database.migrate.config.ts"),
		`export default { databases: { core: { name: "DB", migrationsDir: "./atlas-migrations", provider: { type: "d1", databaseName: "DB", local: true, wranglerConfig: ${JSON.stringify(wranglerConfig)} } } } }\n`,
	)
	return dir
}

describe("a d1 provider's wranglerConfig", () => {
	it("refuses one that is a directory, by name, on every command that reads it", async () => {
		const dir = d1Project("./wrangler-dir")
		for (const command of ["status", "check", "apply", "baseline"]) {
			const io = makeIo(dir, fakeD1({ dir: join(dir, "atlas-migrations") }))
			expect(await runCliWithFakes(["migrate", command, "core"], io)).toBe(1)
			expect(io.errors).toEqual([
				`wranglerConfig ${join(dir, "wrangler-dir")} is a directory, not a file: point core's d1 provider at its wrangler.json, wrangler.jsonc or wrangler.toml`,
			])
		}
	})
})
