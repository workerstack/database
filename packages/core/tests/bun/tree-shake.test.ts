/// <reference types="bun-types" />
/**
 * The format catalog and its pinned registries reach a bundle only through the code that uses
 * them. The registry predicates are separate root exports, so an app importing another root export
 * (named, or through a namespace import) carries no registry, and a tables module declaring every
 * format carries its ids alone: the column helpers import the catalog type-only, and codegen, not
 * the tables module, reads the specs. Each bundle is Bun's minified browser build against the
 * package source under its `"sideEffects": false`.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { fixtureRoot } from "../../src/codegen/__fixtures__/temp.ts"
import { INTEGER_FORMATS, TEXT_FORMATS } from "../../src/formats/catalog.ts"

const SRC = path.resolve(import.meta.dirname, "../../src")
const ROOT = JSON.stringify(path.join(SRC, "index.ts"))

/** A value of the time zone registry and one of the currency registry, each only in its module */
const REGISTRY_MARKERS = ["Europe/Zagreb", "XAU"]

/** A catalog pattern source, a UTS #35 `ca` value the catalog builds a pattern from, and the registries */
const CATALOG_MARKERS = ["^[A-Z]{3}$", "islamic-umalqura", ...REGISTRY_MARKERS]

let dir: string

beforeAll(() => {
	dir = fs.mkdtempSync(path.join(fixtureRoot(), "comb-tree-shake-"))
})

afterAll(() => {
	fs.rmSync(dir, { force: true, recursive: true })
})

/** The minified browser bundle of an entry module holding `source` */
async function bundle(name: string, source: string): Promise<string> {
	const entry = path.join(dir, `${name}.ts`)
	fs.writeFileSync(entry, source)
	const { outputs } = await Bun.build({ entrypoints: [entry], minify: true, target: "browser" })
	expect(outputs).toHaveLength(1)
	return (await outputs[0]?.text()) ?? ""
}

/** The markers of `markers` the bundle holds */
function found(code: string, markers: readonly string[]): string[] {
	return markers.filter((marker) => code.includes(marker))
}

/** A tables module of the dialect with a column per text, enum and integer format */
function tablesModule(table: string, dialect: string): string {
	const text = TEXT_FORMATS.map((format, i) => `\ttext${i}: c.text("text${i}", { format: "${format}" }),`)
	const integer = INTEGER_FORMATS.map((format, i) => `\tint${i}: c.integer("int${i}", { format: "${format}" }),`)
	return `import { ${table} } from "drizzle-orm/${dialect}-core"
import { c } from ${JSON.stringify(path.join(SRC, dialect, "columns.ts"))}

export const row = ${table}("row", {
${text.join("\n")}
	currency: c.enum("currency", ["EUR", "USD"], { format: "iso4217" }),
${integer.join("\n")}
})
`
}

describe("a bundle of the root entry", () => {
	it("leaves the registries out when the app imports isCidr by name", async () => {
		const code = await bundle("named", `import { isCidr } from ${ROOT}\nexport const taken = isCidr("10.0.0.0/8")\n`)
		expect(found(code, REGISTRY_MARKERS)).toEqual([])
	})

	it("leaves the registries out when the app reaches isCidr through a namespace import", async () => {
		const code = await bundle(
			"namespace",
			`import * as comb from ${ROOT}\nexport const taken = comb.isCidr("10.0.0.0/8")\n`,
		)
		expect(found(code, REGISTRY_MARKERS)).toEqual([])
	})

	it("carries the time zone registry when the app uses isIanaTimeZone", async () => {
		const code = await bundle(
			"time-zone",
			`import { isIanaTimeZone } from ${ROOT}\nexport const taken = isIanaTimeZone("UTC")\n`,
		)
		expect(found(code, REGISTRY_MARKERS)).toEqual(["Europe/Zagreb"])
	})
})

describe.each([
	["sqlite", "sqliteTable"],
	["pg", "pgTable"],
])("a bundle of a %s tables module declaring every format", (dialect, table) => {
	it("holds the format ids and none of the catalog", async () => {
		const code = await bundle(`tables-${dialect}`, tablesModule(table, dialect))
		expect([...TEXT_FORMATS, ...INTEGER_FORMATS].filter((format) => !code.includes(`"${format}"`))).toEqual([])
		expect(found(code, CATALOG_MARKERS)).toEqual([])
	})
})
