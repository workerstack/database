import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, matchesGlob } from "node:path"
import { describe, expect, it } from "vitest"
import { brandTokens, spansOf } from "../../../../scripts/brand-names.ts"

/*
 * The package was comb before it was @workerstack/database. Every name it had (the bin, the config files, the env
 * prefix, the OpenAPI extensions, the D1 tracking tables, the exports, the paths and the prose) moved with it, so a
 * comb token anywhere live is a name the rename missed. scripts/brand-names.ts says what is history and may keep it.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..", "..")
const tracked = (): string[] =>
	execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean)

/** Each live comb token in a file, as `path: token`. */
function liveHits(path: string, text: string): string[] {
	return spansOf(path, text)
		.filter((span) => span.live)
		.flatMap((span) => brandTokens(span.text, "comb"))
		.map((token) => `${path}: ${token}`)
}

/** The `paths:` globs in a lesson's frontmatter that match no tracked file. */
export function danglingGlobs(lesson: string, files: readonly string[]): string[] {
	const line = /^paths:\s*(\[.*\])\s*$/m.exec(lesson)?.[1]
	if (!line) return []
	const globs = JSON.parse(line) as string[]
	return globs.filter((glob) => !files.some((file) => matchesGlob(file, glob)))
}

describe("no comb", () => {
	it("leaves no comb token in a live span of a tracked text file", () => {
		const hits = tracked().flatMap((path) => {
			const bytes = readFileSync(join(ROOT, path))
			return bytes.subarray(0, 8192).includes(0) ? [] : liveHits(path, bytes.toString("utf8"))
		})
		expect(hits).toEqual([])
	})

	it("leaves no comb token in a tracked path outside history", () => {
		const paths = tracked().filter((path) => spansOf(path, "x").some((span) => span.live))
		expect(paths.filter((path) => brandTokens(path, "comb").length > 0)).toEqual([])
	})

	it("finds a lesson glob that matches no file, and passes one that does", () => {
		const lesson = '---\npaths: ["src/a.ts","src/gone/**"]\n---\n'
		expect(danglingGlobs(lesson, ["src/a.ts", "src/b.ts"])).toEqual(["src/gone/**"])
	})

	it("points every lesson's paths at files that exist", () => {
		const files = tracked()
		const lessons = files.filter((path) => /^\.rulesync\/lessons\/[^/]+\.md$/.test(path))
		const dangling = lessons.flatMap((path) =>
			danglingGlobs(readFileSync(join(ROOT, path), "utf8"), files).map((glob) => `${path}: ${glob}`),
		)
		expect(dangling).toEqual([])
	})
})
