/**
 * What an index of a Postgres history is, and the name Postgres gives it: its shape as
 * CompareIndexInfo compares two, the name ChooseIndexName chooses (its table, its columns' names
 * and its expressions' as pg-colname.ts figures them, and `pkey`, `key`, `excl` or `idx`, cut to 63
 * bytes as makeObjectName cuts and numbered past every relation its schema holds, and every
 * constraint for a constraint's). pg-index-match.ts takes one made on a partitioned table to each
 * partition, and pg-indexes.ts follows each through a history's statements.
 */
import { figureName } from "./pg-colname.ts"
import { clipped, objectName } from "./pg-foreign.ts"
import { constraintNames, type Facts, flag, keyOf, names, type Node } from "./pg-nodes.ts"

/** What an index is: a plain or unique index, or the index of a primary key, unique or exclusion constraint */
type IndexKind = "exclusion" | "index" | "primary" | "unique"

/** A key or INCLUDE column of an index: the column it names or the expression it computes, with its operator class and collation */
type IndexElement = { collation: string[]; expr: unknown; name: string | undefined; opclass: string[] }

/**
 * What Postgres's CompareIndexInfo compares of two indexes: their elements, INCLUDE columns,
 * predicate, access method, exclusion operators, uniqueness and NULLS NOT DISTINCT; ordering is not
 */
type IndexShape = {
	elements: IndexElement[]
	include: string[]
	method: string
	nullsNotDistinct: boolean
	ops: string[][]
	unique: boolean
	where: unknown
}

/**
 * An index, by key in Facts.indexes: its table, its kind, its shape, its columns as the index names
 * them (which a clone copies, and a column's RENAME leaves alone), the partitioned index it is
 * attached to, and the tablespace the history put it in, undefined where it left that to the target.
 * `unsure` marks a clone database cannot place: `order` where its name may have swapped with
 * another's (clones whose names cut to one, on partitions it cannot order, some partitioned and some
 * not, so it cannot tell which of those names is a partitioned index's), `match` where Postgres may
 * have attached a partition's own index in its place (pg-index-match.ts)
 */
type IndexFact = {
	columns: string[]
	kind: IndexKind
	parent?: IndexFact | undefined
	shape: IndexShape
	table: string
	tablespace?: string | undefined
	unsure?: "match" | "order" | undefined
}

/** An index a statement asks for: its fact, its name when the statement gives one, and what makes it the same as another */
type Wanted = { dedup: string; fact: IndexFact; name: string | undefined }

/** A name list, empty when absent */
const list = (value: unknown): string[] => (value === undefined ? [] : names(value))

/** A parse tree without its locations, which two spellings of one expression differ in */
const located = (tree: unknown): unknown =>
	tree === undefined
		? undefined
		: JSON.parse(JSON.stringify(tree, (key, value) => (key === "location" ? undefined : value)))

/** `name` keyed in the schema the relation `table`'s key names, as an index lives in its table's */
function besideTable(table: string, name: string, schema: string): string {
	const parts = table.split(".")
	return keyOf(parts.length > 1 ? [parts[0] as string, name] : [name], schema)
}

/** An IndexElem as an element */
const elementOf = (elem: Node): IndexElement => ({
	collation: list(elem["collation"]),
	expr: located(elem["expr"]),
	name: elem["name"] as string | undefined,
	opclass: list(elem["opclass"]),
})

/**
 * The names an index gives its columns, as ChooseIndexColumnNames gives them: each key's and
 * INCLUDE column's own, an expression's as pg-colname.ts figures it or `expr`, and a name taken
 * already numbered 1, 2, …, cut so it stays under 64 bytes
 */
function columnNames(written: ReadonlyArray<string | undefined>): string[] {
	const out: string[] = []
	for (const name of written) {
		const origin = name ?? "expr"
		let current = origin
		for (let i = 1; out.includes(current); i += 1) current = clipped(origin, 63 - String(i).length) + String(i)
		out.push(current)
	}
	return out
}

/** The label ChooseIndexName gives an index of `kind` */
const LABELS: Readonly<Record<IndexKind, string>> = { exclusion: "excl", index: "idx", primary: "pkey", unique: "key" }

/** Whether `key` is a relation's in its schema, or for a constraint, a constraint's */
function taken(facts: Facts, key: string, constraint: boolean): boolean {
	const { indexes, relations, tables, views } = facts
	if (tables.has(key) || views.has(key) || indexes.has(key) || relations.has(key)) return true
	if (!constraint) return false
	for (const [owner, name] of constraintNames(facts)) if (besideTable(owner, name, facts.schema) === key) return true
	return false
}

/** The name ChooseIndexName tries for `fact` on its `pass`th try, numbered from the second */
function candidate(fact: IndexFact, pass: number): string {
	const label = pass === 0 ? LABELS[fact.kind] : `${LABELS[fact.kind]}${pass}`
	const columns = fact.kind === "primary" ? "" : fact.columns.join("_")
	return objectName(fact.table.split(".").at(-1) as string, columns, label)
}

/** The key Postgres names `fact` under on its table: ChooseRelationName's, numbered past every name taken */
function chosen(facts: Facts, fact: IndexFact): string {
	for (let pass = 0; ; pass += 1) {
		const key = besideTable(fact.table, candidate(fact, pass), facts.schema)
		if (!taken(facts, key, fact.kind !== "index")) return key
	}
}

/** The indexes on `table` */
const indexesOn = (facts: Facts, table: string): IndexFact[] =>
	[...facts.indexes.values()].filter((each) => each.table === table)

/** A CREATE INDEX's index */
function indexWanted(table: string, node: Node): Wanted {
	const params = (node["indexParams"] as Node[]).map((each) => each["IndexElem"] as Node)
	const include = ((node["indexIncludingParams"] as Node[] | undefined) ?? []).map((each) => each["IndexElem"] as Node)
	const shape: IndexShape = {
		elements: params.map(elementOf),
		include: include.map((elem) => String(elem["name"])),
		method: String(node["accessMethod"]),
		nullsNotDistinct: flag(node["nulls_not_distinct"]),
		ops: [],
		unique: flag(node["unique"]),
		where: located(node["whereClause"]),
	}
	const written = [...params, ...include].map(
		(elem) => (elem["indexcolname"] ?? elem["name"] ?? figureName(elem["expr"])) as string | undefined,
	)
	const fact: IndexFact = {
		columns: columnNames(written),
		kind: "index",
		shape,
		table,
		tablespace: node["tableSpace"] as string | undefined,
	}
	return { dedup: "", fact, name: node["idxname"] as string | undefined }
}

// lookup-table: the constraints that make an index, and the kind of index each makes
const CONSTRAINTS: Readonly<Record<string, IndexKind>> = {
	CONSTR_EXCLUSION: "exclusion",
	CONSTR_PRIMARY: "primary",
	CONSTR_UNIQUE: "unique",
}

/** The index a PRIMARY KEY, UNIQUE or EXCLUDE constraint on `table` makes, on `column` when a column declares it; undefined for another constraint */
function constraintWanted(table: string, constraint: Node, column?: string): Wanted | undefined {
	const kind = CONSTRAINTS[String(constraint["contype"])]
	if (kind === undefined) return undefined
	const exclusions = ((constraint["exclusions"] as Node[] | undefined) ?? []).map(
		(each) => (each["List"] as Node)["items"] as Node[],
	)
	const elements =
		kind === "exclusion"
			? exclusions.map(([elem]) => elementOf((elem as Node)["IndexElem"] as Node))
			: (column === undefined ? list(constraint["keys"]) : [column]).map((name) => ({
					collation: [],
					expr: undefined,
					name,
					opclass: [],
				}))
	const include = list(constraint["including"])
	const shape: IndexShape = {
		elements,
		include,
		method: String(constraint["access_method"] ?? "btree"),
		nullsNotDistinct: flag(constraint["nulls_not_distinct"]),
		ops: exclusions.map(([, ops]) => list(((ops as Node)["List"] as Node)["items"])),
		unique: kind !== "exclusion",
		where: located(constraint["where_clause"]),
	}
	const fact: IndexFact = {
		columns: columnNames([...elements.map((each) => each.name ?? figureName(each.expr)), ...include]),
		kind,
		shape,
		table,
	}
	/* transformIndexConstraints merges two constraints equal but for uniqueness, deferrable and initially deferred alike */
	const dedup = JSON.stringify([
		{ ...shape, unique: undefined },
		flag(constraint["deferrable"]),
		flag(constraint["initdeferred"]),
	])
	return { dedup, fact, name: constraint["conname"] as string | undefined }
}

/**
 * The indexes one statement's constraints make, as transformIndexConstraints orders them: the
 * primary key first, and each equal to one before it merged into it, which keeps the first one's
 * name, or the later one's when the first has none
 */
function merged(wanted: ReadonlyArray<Wanted | undefined>): Wanted[] {
	const out: Wanted[] = []
	const ordered = wanted
		.filter((each) => each !== undefined)
		.toSorted((one, two) => Number(two.fact.kind === "primary") - Number(one.fact.kind === "primary"))
	for (const each of ordered) {
		const prior = out.find((one) => one.dedup === each.dedup)
		if (prior === undefined) out.push(each)
		else prior.name ??= each.name
	}
	return out
}

/** The index under `key` dropped, with every index attached to it, down the partitions */
function dropIndex(facts: Facts, key: string): void {
	const fact = facts.indexes.get(key)
	if (fact === undefined) return
	facts.indexes.delete(key)
	for (const [child, each] of Array.from(facts.indexes)) if (each.parent === fact) dropIndex(facts, child)
}

/** `facts.indexes` with `from` keyed `to`, in its place */
function rekey(facts: Facts, from: string, to: string): void {
	const entries = [...facts.indexes].map(([key, fact]) => [key === from ? to : key, fact] as const)
	facts.indexes.clear()
	for (const [key, fact] of entries) facts.indexes.set(key, fact)
}

export {
	besideTable,
	chosen,
	candidate,
	constraintWanted,
	dropIndex,
	indexesOn,
	type IndexElement,
	type IndexFact,
	type IndexShape,
	indexWanted,
	type Wanted,
	list,
	merged,
	rekey,
	taken,
}
