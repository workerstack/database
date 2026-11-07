/**
 * An editor shows no JSDoc on a string-literal member, so the `format?` key's own doc is the one
 * place a reader hovering `format: "…"` learns what each id means. Each `format?` key of the
 * constraint types lists every id its catalog holds, in the catalog's order, one line each: the
 * id, the spec's standard as the catalog states it, an example value the format takes as written
 * (a code span),
 * and on a text format whether a pinned registry is checked. The doc cannot drift from the catalog.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ts } from "ts-morph"
import { describe, expect, it } from "vitest"
import {
	FORMATS,
	formatTakes,
	INTEGER_FORMATS,
	INTEGER_SPECS,
	type IntegerFormat,
	TEXT_FORMATS,
	type TextFormat,
} from "../../src/formats/catalog.ts"

const FILE = join(import.meta.dirname, "../../src/sqlite/constraints.ts")

/** One documented id: the id and the `;`-separated parts after its colon */
type Line = { readonly id: string; readonly parts: readonly string[] }

/** The value an example code span holds, or null for a part written as no code span */
const spanned = (part: string): string | null => /^`([^`]+)`$/u.exec(part)?.[1] ?? null

/** Each `format?` key of the file, by the type alias that holds it, as the `- \`id\`: …` lines of its JSDoc */
function documented(): Record<string, readonly Line[]> {
	const source = ts.createSourceFile(FILE, readFileSync(FILE, "utf8"), ts.ScriptTarget.Latest, true)
	const keys: Record<string, readonly Line[]> = {}
	const visit = (node: ts.Node, alias: string | null): void => {
		const holder = ts.isTypeAliasDeclaration(node) ? node.name.text : alias
		if (ts.isPropertySignature(node) && ts.isIdentifier(node.name) && node.name.text === "format" && holder !== null) {
			const text = ts
				.getJSDocCommentsAndTags(node)
				.map((doc) => ts.getTextOfJSDocComment(doc.comment) ?? "")
				.join("\n")
			keys[holder] = text
				.split("\n")
				.filter((line) => line.startsWith("- "))
				.map((line) => {
					const [, id = "", rest = ""] = /^- `([^`]*)`: (.*)$/u.exec(line) ?? []
					return { id, parts: rest.split("; ") }
				})
		}
		ts.forEachChild(node, (child) => visit(child, holder))
	}
	visit(source, null)
	return keys
}

const KEYS = documented()

/** The line a text format's id must have: its standard, an example it takes, whether a registry is checked */
function textLine(line: Line): readonly string[] {
	const spec = FORMATS[line.id as TextFormat]
	const [, example = ""] = line.parts
	const value = spanned(example)
	return [
		spec.standard,
		value !== null && formatTakes(line.id as TextFormat, value) ? example : "",
		spec.member === null ? "pattern only" : "registry",
	]
}

/** The line an integer format's id must have: its standard, and an example inside its range */
function integerLine(line: Line): readonly string[] {
	const spec = INTEGER_SPECS[line.id as IntegerFormat]
	const [, example = ""] = line.parts
	const value = Number(spanned(example))
	return [spec.standard, Number.isInteger(value) && value >= spec.min && value <= spec.max ? example : ""]
}

describe("the format? JSDoc of the constraint types", () => {
	it("is on c.text's, c.enum's and c.integer's keys alone", () => {
		expect(Object.keys(KEYS).toSorted()).toEqual(["EnumOptions", "IntegerConstraints", "TextConstraints"])
	})

	for (const alias of ["TextConstraints", "EnumOptions"])
		it(`lists every text format on ${alias}, in order, with its standard, an example it takes and its registry`, () => {
			const lines = KEYS[alias] ?? []
			expect(lines.map((line) => line.id)).toEqual(TEXT_FORMATS)
			for (const line of lines) expect(line.parts, line.id).toEqual(textLine(line))
		})

	it("lists every integer format on IntegerConstraints, in order, with its standard and an example in range", () => {
		const lines = KEYS["IntegerConstraints"] ?? []
		expect(lines.map((line) => line.id)).toEqual(INTEGER_FORMATS)
		for (const line of lines) expect(line.parts, line.id).toEqual(integerLine(line))
	})
})
