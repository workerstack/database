/**
 * The verdicts of the differential and their reconciliation with the expectations table (../expectations.ts). A
 * verdict passes, is a refusal its mode allows, or fails, with the shape it matches when one does.
 */
import { EXPECTED, type Shape, type ShapeId } from "../expectations.ts"
import { type ListCase, LONG_TEXT } from "./list-cases.ts"
import { idsOf, type Truth, type Walk } from "./lists.ts"
import type { Version } from "./oracles.ts"
import type { Check, Truth as ProofTruth } from "./proof.ts"

export type Verdict =
	| { kind: "pass" }
	| { kind: "refused"; why: string }
	| { kind: "fail"; shape: ShapeId | undefined; what: string }

/* comb's deterministic refusals of a list it cannot page (500, sort_not_wired), which a cursor walk may meet */
const REFUSALS = new Set(["sort_not_wired", "page_not_wired"])

/** Whether a SQL literal is a TEXT that reads as a number, as '10' or '-2.5' */
const numericText = (literal: string): boolean =>
	/^'.*'$/s.test(literal) && literal.length > 2 && Number.isFinite(Number(literal.slice(1, -1)))
/** Whether a SQL literal is a number SQLite stores as INTEGER or REAL */
const storedNumber = (literal: string): boolean => /^-?[\d.]/.test(literal)

/**
 * QL2's shape: a cursor walk over a key whose drizzle column reads text or bytes, declared with no type or BLOB,
 * so a CAST's affinity applies to it, holding a number beside a TEXT that reads as one. Only a cursor binds the key.
 */
function ql2Shape(c: ListCase): boolean {
	if (c.mode !== "cursor") return false
	return c.keys.some((kind, index) => {
		if (
			(kind.ddl !== "" && kind.ddl !== "BLOB") ||
			(kind.drizzle.builder !== "text" && kind.drizzle.builder !== "blob")
		)
			return false
		const stored = c.rows.map((row) => row[index + 1] as string)
		return stored.some(numericText) && stored.some(storedNumber)
	})
}

/* a key no cursor of a derived list can hold: past the cursor's length cap, or an integer its driver rounds */
const unmintable = (literal: string): boolean => literal === LONG_TEXT || /^-?\d{16,}$/.test(literal)

/**
 * QL8's two shapes, for a page by number refused on `page`: the row its next cursor would be minted from (the last
 * row of a page with more) holds a key no cursor can, or it does not, and the refusal was for a row no cursor is
 * minted from
 */
function ql8Shape(c: ListCase, truth: Truth, page: number): ShapeId {
	const last = page * c.limit - 1
	const minted = last < truth.size - 1 ? [...truth].find(([, { position }]) => position === last)?.[0] : undefined
	const row = c.rows.find((each) => each[0] === `'${minted}'`)
	return row !== undefined && row.slice(1, -1).some(unmintable) ? "QL8-mint" : "QL8"
}

/** How a walk that stopped with no cursor to follow served other than the engine's order up to where it stopped: rows twice, outside the filter or out of order, or a row ranked before its last row left out, ties in any order */
function unlikePrefix(walk: Walk, truth: Truth): string | undefined {
	const served = walk.served
	const ranks = served.map((id) => truth.get(id)?.rank ?? Number.NaN)
	const last = Math.max(...ranks)
	const what = [
		served.some((id, index) => served.indexOf(id) !== index) ? "served a row twice" : "",
		ranks.some(Number.isNaN) ? "served a row outside the filter" : "",
		ranks.some((rank, index) => index > 0 && rank < (ranks[index - 1] as number)) ? "out of order" : "",
		[...truth].some(([id, { rank }]) => rank < last && !served.includes(id)) ? "left out a row before its last" : "",
		walk.misprojected.length > 0 ? `projected ${walk.misprojected[0]}` : "",
	].filter(Boolean)
	return what.length === 0 ? undefined : `${what.join("; ")}: served ${JSON.stringify(served)}`
}

/** How the walk broke the rule: rows served twice or never, rows outside the filter or out of the engine's order, a walk that never ended, a projection other than `select` */
function brokenRule(c: ListCase, walk: Walk, truth: Truth): string | undefined {
	const served = walk.served
	const twice = served.filter((id, index) => served.indexOf(id) !== index)
	const outside = served.filter((id) => !truth.has(id))
	const skipped = idsOf(c).filter((id) => truth.has(id) && !served.includes(id))
	const ranks = served.map((id) => truth.get(id)?.rank ?? Number.NaN)
	const disorder = ranks.findIndex((rank, index) => index > 0 && rank < (ranks[index - 1] as number))
	const what = [
		walk.pages >= c.rows.length + 3 ? `never ended (${walk.pages} pages)` : "",
		twice.length > 0 ? `served twice ${[...new Set(twice)].join(" ")}` : "",
		outside.length > 0 ? `served outside the filter ${outside.join(" ")}` : "",
		skipped.length > 0 ? `skipped ${skipped.join(" ")}` : "",
		disorder !== -1 ? `out of order at ${disorder}` : "",
		walk.misprojected.length > 0 ? `projected ${walk.misprojected[0]} for select ${c.select}` : "",
	].filter(Boolean)
	return what.length === 0 ? undefined : `${what.join("; ")}: served ${JSON.stringify(served)}`
}

/** The verdict of one walk of `c` against the engine's `truth` */
export function judgeList(c: ListCase, walk: Walk, truth: Truth): Verdict {
	const { error } = walk
	if (error !== undefined && REFUSALS.has(error.key ?? "")) {
		const why = `${error.key} on page ${error.page}: ${error.message}`
		/* a cursor walk may meet item 85's refusal; a page by number serves its rows (QL8) */
		if (c.mode === "cursor") return { kind: "refused", why }
		return { kind: "fail", shape: ql8Shape(c, truth, error.page), what: `refused a page by number: ${why}` }
	}
	if (error !== undefined)
		return {
			kind: "fail",
			shape: undefined,
			what: `threw ${error.key ?? "an error"} on page ${error.page}: ${error.message}`,
		}
	if (walk.stopped !== undefined) {
		const wrong = unlikePrefix(walk, truth)
		if (wrong === undefined)
			return { kind: "refused", why: `no cursor past page ${walk.stopped}: nextCursor null while hasMore holds` }
		return {
			kind: "fail",
			shape: ql2Shape(c) ? "QL2" : undefined,
			what: `stopped after page ${walk.stopped}: ${wrong}`,
		}
	}
	const broken = brokenRule(c, walk, truth)
	if (broken === undefined) return { kind: "pass" }
	return { kind: "fail", shape: ql2Shape(c) ? "QL2" : undefined, what: broken }
}

/** One verdict as the run records it: where it came from, so a report names the seed that replays it */
export type Result = {
	driver: string
	fixed: boolean
	index: number
	label: string
	seed: number
	verdict: Verdict
	version: Version
}
type Failure = Result & { verdict: { kind: "fail" } }

/** A failure as a report line, with the seed and case that replay it */
const line = (r: Failure): string =>
	`${r.version} ${r.driver} seed ${r.seed} case ${r.index} ${r.label}: ${r.verdict.shape ? `${r.verdict.shape}: ` : ""}${r.verdict.what}`

/** Where the table holds `shape` on `version`: expected to fail, held to pass, or not held */
function holding(shape: ShapeId, version: Version): "fails" | "passes" | "unheld" {
	const entry: Shape = EXPECTED[shape]
	if (entry.failsOn.includes(version)) return "fails"
	return entry.passesOn.includes(version) ? "passes" : "unheld"
}

/**
 * The results against the table:
 * - `unexpected` fails the run: a failure on the tip no shape expects, or a shape on a version it passes on
 * - `expected` holds the failures a shape expects, `reported` a release's own; the run prints both with their seeds
 */
export function reconcile(results: readonly Result[]): {
	expected: string[]
	reported: string[]
	unexpected: string[]
} {
	const failures = results.filter((r): r is Failure => r.verdict.kind === "fail")
	const held = (r: Failure) =>
		r.verdict.shape === undefined ? (r.version === "tip" ? "passes" : "unheld") : holding(r.verdict.shape, r.version)
	return {
		expected: failures.filter((r) => held(r) === "fails").map(line),
		reported: failures.filter((r) => held(r) === "unheld").map(line),
		unexpected: failures.filter((r) => held(r) === "passes").map(line),
	}
}

/**
 * Each shape of `suite` with each of `versions` the table expects it to fail on, the tip's first: the known-red
 * list. A run must show each on a fixed seed, or it could not tell the fix from no fix; once a fix lands, its fixed
 * seeds pass, and the shape's test names the edit that clears it
 */
export function expectedRed(
	suite: Shape["suite"],
	versions: readonly Version[],
): Array<{ shape: ShapeId; title: string; version: Version }> {
	return (Object.keys(EXPECTED) as ShapeId[])
		.filter((shape) => EXPECTED[shape].suite === suite)
		.flatMap((shape) =>
			versions.filter((version) => holding(shape, version) === "fails").map((version) => ({ shape, version })),
		)
		.toSorted((a, b) => Number(b.version === "tip") - Number(a.version === "tip"))
		.map(({ shape, version }) => {
			const named = shape === EXPECTED[shape].finding ? shape : `${shape} (${EXPECTED[shape].finding})`
			const title =
				version === "tip"
					? `known red on the tip: ${named}, until its fix moves "tip" to EXPECTED["${shape}"].passesOn`
					: `${named} fails on ${version}`
			return { shape, title, version }
		})
}

/** The fixed-seed failures of `shape` on `version`, as report lines, which its expectedRed test needs one of */
export const shownBy = (results: readonly Result[], shape: ShapeId, version: Version): string[] =>
	results
		.filter(
			(r): r is Failure => r.fixed && r.version === version && r.verdict.kind === "fail" && r.verdict.shape === shape,
		)
		.map(line)

/**
 * The verdict of one version's check of a proof case against what D1 did with it: check passes exactly the
 * files D1 applies and that leave every read and write the schema promises working.
 * - SD1's shape: check passed a file after which D1 refuses a read or write of an object the file left as it was,
 *   naming what the file took away
 * - SD2's shape: check refused a file D1 applies and that breaks nothing, as a write to a view no trigger takes
 */
export function judgeProof(check: Check, truth: ProofTruth): Verdict {
	const breaks =
		truth.failed === undefined ? truth.broken : [{ error: truth.failed, probe: "the file itself", unchanged: false }]
	const said = check.lines.join("\n")
	if (check.code !== 0 && check.code !== 1)
		return { kind: "fail", shape: undefined, what: `check ended with ${check.code}: ${said}` }
	if ((check.code === 0) === (breaks.length === 0)) return { kind: "pass" }
	if (check.code === 0) {
		const sd1 = breaks.some(({ error, unchanged }) => unchanged && /no such (table|view|column)/.test(error))
		const what = breaks.map(({ error, probe }) => `${probe}: ${error}`).join("; ")
		return { kind: "fail", shape: sd1 ? "SD1" : undefined, what: `check passed a file after which D1 refuses ${what}` }
	}
	const sd2 = /cannot modify \S+ because it is a view/.test(said)
	return {
		kind: "fail",
		shape: sd2 ? "SD2" : undefined,
		what: `check refused a file D1 applies and that breaks nothing: ${said}`,
	}
}
