/**
 * database/export-name: a name a public entry exports is specific to this package, never a bare one-word type that
 * collides with a consumer's own or a Cloudflare Workers type. In process over a package written to disk, because
 * the rule reads the entries from its package.json and an `export *` target from disk, and once through oxlint.
 */
import { describe, expect, it } from "vitest"
import plugin from "./index.js"
import { type Fixture, oxlintReports, reportsOnDisk } from "./rule-harness.ts"

const rule = plugin.rules["export-name"]
const MANIFEST = JSON.stringify({
	exports: { ".": { "types@>=5.7": "./types/index.d.ts", default: "./src/index.ts" } },
})

const bare = (name: string) =>
	`\`${name}\` is exported from "." as a bare name: a consumer's own ${name} collides with it, so name it for what it is (MigrateRun, not Run)`
const workers = (name: string) =>
	`\`${name}\` is exported from "." under the name of a Cloudflare Workers type, so a consumer importing both collides: name it for what it is`

const messages = (fixture: Fixture) =>
	reportsOnDisk(rule, { "package.json": MANIFEST, ...fixture }).map((report) => report.message)

describe("database/export-name: the names it reports", () => {
	it("reports a bare one-word name and a Workers type name exported from an entry", () => {
		const code = "export type Run = {}\nexport interface ExecutionContext {}\n"
		expect(messages({ "src/index.ts": code })).toEqual([bare("Run"), workers("ExecutionContext")])
	})

	it("reports a bare class and const, and a bare name a re-export carries", () => {
		const code =
			'export class Dialect {}\nexport const Manifest = 1\nexport type { Fallback } from "./a.ts"\nexport { Terminal as Connection } from "./a.ts"\n'
		expect(messages({ "src/index.ts": code })).toEqual([
			bare("Dialect"),
			bare("Manifest"),
			bare("Fallback"),
			bare("Connection"),
		])
	})

	it("reports the names an export star carries into the entry", () => {
		const fixture = {
			"src/index.ts": 'export * from "./a.ts"\n',
			"src/a.ts": "export type Run = {}\nexport const ok = 1\n",
		}
		expect(messages(fixture)).toEqual([bare("Run")])
	})

	it("reports a namespace re-export and a string-named export by the name the consumer imports", () => {
		const code =
			'export * as Dialect from "./a.ts"\nexport * as "Manifest" from "./a.ts"\nconst run = 1\nexport { run as "Run" }\n'
		expect(messages({ "src/index.ts": code, "src/a.ts": "export const ok = 1\n" })).toEqual([
			bare("Dialect"),
			bare("Manifest"),
			bare("Run"),
		])
	})

	it("follows a star cycle once and leaves a package's star alone", () => {
		const fixture = {
			"src/index.ts": 'export * from "./a.ts"\nexport * from "drizzle-orm"\n',
			"src/a.ts": 'export * from "./b.ts"\nexport type Run = {}\n',
			"src/b.ts": 'export * from "./a.ts"\nexport type Tiebreak = {}\n',
		}
		expect(messages(fixture)).toEqual([bare("Run"), bare("Tiebreak")])
	})

	it("passes specific names", () => {
		const code = "export type MigrateRun = {}\nexport class DatabaseError {}\nexport const defineConfig = 1\n"
		expect(messages({ "src/index.ts": code })).toEqual([])
	})
})

describe("database/export-name: the files it checks", () => {
	it("passes a bare name in a file that is not an entry", () => {
		expect(messages({ "src/index.ts": "export {}\n", "src/run.ts": "export type Run = {}\n" })).toEqual([])
	})

	it("checks only the files an entry's ./src/ default names", () => {
		const manifest = JSON.stringify({
			exports: {
				".": { default: "./src/index.ts" },
				"./built": { default: "./dist/built.js" },
				"./package.json": "./package.json",
			},
		})
		const fixture = {
			"package.json": manifest,
			"src/index.ts": "export {}\n",
			"dist/built.js": "export const Run = 1\n",
		}
		expect(reportsOnDisk(rule, fixture).map((report) => report.message)).toEqual([])
	})

	it("passes a file in no package that ships its source", () => {
		expect(reportsOnDisk(rule, { "src/index.ts": "export type Run = {}\n" })).toEqual([])
	})

	it("fails oxlint through the database plugin entry", () => {
		const fixture = {
			"package.json": MANIFEST,
			"src/index.ts": "export type Run = {}\n",
			"src/run.ts": "export type Run = {}\n",
		}
		expect(oxlintReports("export-name", fixture)).toEqual([{ file: "src/index.ts", message: bare("Run") }])
	})
})
