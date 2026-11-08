/**
 * The expectations table: each shape of failure the differential knows, the finding it is, and the versions it
 * fails and passes on. A failing walk or check is matched to a shape by what it did (support/judge.ts).
 *
 * - On a version in `failsOn`, the shape is expected, and a fixed seed must show it: a finding the table says is
 *   open but no fixed seed reaches would leave the harness unable to tell the fix from no fix.
 * - On a version in `passesOn`, the shape fails the run.
 * - On a version in neither, it is that release's own and is reported with its seed, unheld.
 * - A failure no shape matches fails the run on the tip, and is reported on a release.
 *
 * The tip is in exactly one of the two lists. The commit that fixes a finding moves "tip" from `failsOn` to
 * `passesOn` in each of its shapes.
 */
import type { Version } from "./support/oracles.ts"

export type ShapeId = keyof typeof EXPECTED
export type Shape = {
	claim: string
	failsOn: readonly Version[]
	finding: string
	passesOn: readonly Version[]
	suite: "lists" | "proof"
}

export const EXPECTED = {
	/* plan 25's 3.1 moves "tip" to passesOn. 0.20.1 is unheld: it answered QL2's own repro with a 400, and has
	   failures of its own in the same inputs, which 0.21 fixed */
	QL2: {
		claim:
			"a key held apart, in a text or blob column of no affinity or BLOB's beside a TEXT that reads as a number, binds through cast(? as real|integer), whose affinity converts that TEXT: a cursor walk skips rows ascending and loops descending",
		failsOn: ["tip", "0.21.0"],
		finding: "QL2",
		passesOn: [],
		suite: "lists",
	},
	/* plan 25's 3.2 moves "tip" to passesOn. 0.20.1 is unheld: it served QL8's pages, but refuses a page by number
	   of its own over a timestamp key no JS Date holds (seeds 10, 31 and 43) */
	QL8: {
		claim: "a page by number is refused with 500 for a row no cursor is minted from, which 0.20.1 served",
		failsOn: ["tip", "0.21.0"],
		finding: "QL8",
		passesOn: [],
		suite: "lists",
	},
	/* plan 25's 3.2 moves "tip" to passesOn: its fix serves such a page with nextCursor null and hasMore true */
	"QL8-mint": {
		claim:
			"a page by number is refused with 500 for the row its next cursor would be minted from, a row no cursor can hold",
		failsOn: ["tip", "0.21.0", "0.20.1"],
		finding: "QL8",
		passesOn: [],
		suite: "lists",
	},
	/* plan 25's 3.9 moves "tip" to passesOn */
	SD1: {
		claim: "a file dropping what an unchanged trigger or view uses passes check, then a write or a read fails on D1",
		failsOn: ["tip", "0.21.0"],
		finding: "SD1",
		passesOn: [],
		suite: "proof",
	},
	/* plan 25's 3.9 moves "tip" to passesOn */
	SD2: {
		claim: "an INSTEAD OF trigger for one or two events of a view is refused, though D1 applies it and runs its writes",
		failsOn: ["tip", "0.21.0"],
		finding: "SD2",
		passesOn: [],
		suite: "proof",
	},
} as const satisfies Record<string, Shape>
