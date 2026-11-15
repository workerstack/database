/**
 * A partitioned table's partitions in the order Postgres keeps them in its partition descriptor,
 * the order DefineIndex clones an index down them and so numbers their names: RANGE by lower bound,
 * MINVALUE first; LIST by its least value, a partition of NULL alone after them; HASH by modulus,
 * then remainder; DEFAULT last. Bounds are compared as numbers, booleans, MINVALUE and MAXVALUE,
 * or ISO dates and timestamps; any other bound sorts as a collation or a cast would, which database
 * does not know, so those partitions keep the history's order and the order is not sure. Held to
 * Postgres 17 by tests/integration/postgres/index-names-oracle.test.ts.
 */
import { type Facts, flag, type Node, num } from "./pg-nodes.ts"

/** A bound's value database compares: a number, MINVALUE or MAXVALUE as an edge, or an ISO date or timestamp */
type Datum = { kind: "edge" | "number"; value: number } | { kind: "time"; value: string }

/** Where a partition sorts: its group, DEFAULT and NULL alone after the rest, then its values */
type Rank = { group: number; values: Datum[] }

const ISO = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/

/** A constant bound's value as database compares it, `null` for a NULL, undefined when it is none of a Datum's kinds */
function constantOf(constant: Node): Datum | null | undefined {
	if (flag(constant["isnull"])) return null
	const text = (constant["sval"] as Node | undefined)?.["sval"]
	if (typeof text === "string" && ISO.test(text)) return { kind: "time", value: text.replace("T", " ") }
	if (constant["fval"] !== undefined) return { kind: "number", value: Number((constant["fval"] as Node)["fval"]) }
	if (constant["boolval"] !== undefined)
		return { kind: "number", value: flag((constant["boolval"] as Node)["boolval"]) ? 1 : 0 }
	if (constant["ival"] !== undefined) return { kind: "number", value: num((constant["ival"] as Node)["ival"]) }
	return undefined
}

/** A bound's value as database compares it, `null` for a NULL, undefined when it is none of a Datum's kinds */
function datumOf(written: unknown): Datum | null | undefined {
	const node = written as Node
	if (node["TypeCast"] !== undefined) return datumOf((node["TypeCast"] as Node)["arg"])
	const fields = (node["ColumnRef"] as Node | undefined)?.["fields"] as Node[] | undefined
	const word = (fields?.[0]?.["String"] as Node | undefined)?.["sval"]
	if (word === "minvalue" || word === "maxvalue") return { kind: "edge", value: word === "minvalue" ? -1 : 1 }
	const constant = node["A_Const"] as Node | undefined
	return constant === undefined ? undefined : constantOf(constant)
}

/** -1, 0 or 1 as `one` sorts before, with or after `two`; undefined when database cannot tell */
function compareDatum(one: Datum, two: Datum): number | undefined {
	const edge = (each: Datum): number => (each.kind === "edge" ? each.value : 0)
	if (edge(one) !== edge(two)) return Math.sign(edge(one) - edge(two))
	if (one.kind !== two.kind) return undefined
	if (one.value === two.value) return 0
	return one.value < (two.value as typeof one.value) ? -1 : 1
}

/** `values` compared in turn, the first that differs deciding */
function compareValues(one: readonly Datum[], two: readonly Datum[]): number | undefined {
	for (let at = 0; at < Math.min(one.length, two.length); at += 1) {
		const order = compareDatum(one[at] as Datum, two[at] as Datum)
		if (order !== 0) return order
	}
	return 0
}

/** A LIST partition's rank: its least value's, a partition of NULL alone in the group after */
function listRank(datums: ReadonlyArray<Datum | null | undefined>): Rank | undefined {
	if (datums.includes(undefined)) return undefined
	const values = datums.filter((each) => each !== null) as Datum[]
	if (values.length === 0) return { group: 1, values: [] }
	let least = values[0] as Datum
	for (const each of values.slice(1)) {
		const order = compareDatum(each, least)
		if (order === undefined) return undefined
		if (order < 0) least = each
	}
	return { group: 0, values: [least] }
}

/** Where a partition of `bound` sorts, undefined when database cannot rank it */
function rankOf(bound: Node | undefined): Rank | undefined {
	if (bound === undefined) return undefined
	if (flag(bound["is_default"])) return { group: 2, values: [] }
	if (bound["strategy"] === "h") {
		return {
			group: 0,
			values: [
				{ kind: "number", value: num(bound["modulus"]) },
				{ kind: "number", value: num(bound["remainder"]) },
			],
		}
	}
	const datums = (bound[bound["strategy"] === "l" ? "listdatums" : "lowerdatums"] as unknown[]).map(datumOf)
	if (bound["strategy"] === "l") return listRank(datums)
	return datums.every((each) => each !== null && each !== undefined)
		? { group: 0, values: datums as Datum[] }
		: undefined
}

/**
 * Each partition of `table` in the order Postgres keeps them; in the history's order when database
 * cannot rank them all, and then `sure` is false
 */
function partitionsOf(facts: Facts, table: string): { children: string[]; sure: boolean } {
	const ranked = [...facts.parents].flatMap(([child, parents]) => {
		const entry = parents.find((each) => each.partition && each.parent === table)
		return entry === undefined ? [] : [{ child, rank: rankOf(entry.bound) }]
	})
	const children = ranked.map(({ child }) => child)
	if (ranked.some(({ rank }) => rank === undefined)) return { children, sure: ranked.length < 2 }
	let sure = true
	const sorted = ranked.toSorted((one, two) => {
		const [a, b] = [one.rank as Rank, two.rank as Rank]
		const order = a.group === b.group ? compareValues(a.values, b.values) : a.group - b.group
		if (order === undefined) sure = false
		return order ?? 0
	})
	return sure ? { children: sorted.map(({ child }) => child), sure } : { children, sure }
}

/** `table` and every partition under it, each followed by its own, in the order Postgres keeps them */
const lineage = (facts: Facts, table: string): string[] => [
	table,
	...partitionsOf(facts, table).children.flatMap((child) => lineage(facts, child)),
]

export { lineage, partitionsOf }
