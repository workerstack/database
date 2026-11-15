/**
 * The names an index Postgres names numbers past that no other fact keeps (pg-index-facts.ts
 * `taken`): each sequence and composite type, which ChooseRelationName finds in pg_class, and each
 * table's named CHECKs and constraint triggers, which ChooseConstraintName finds in pg_constraint
 * for a constraint's index. Each follows its renames, moves and drops; a CHECK is held by each
 * partition and child it reaches, which keeps it once detached, and a table's own rename, move and
 * drop carry its names with it (pg-names.ts). A constraint trigger's rename leaves its constraint's
 * name. Held to Postgres 17 by tests/integration/postgres/index-names-oracle.test.ts.
 */
import { lineage } from "./pg-partition-order.ts"
import { type Facts, flag, keyOf, names, type Node, tableOf } from "./pg-nodes.ts"

/** A CHECK constraint's name, undefined for another constraint or an unnamed one, whose `_check` name no index takes */
const checkName = (constraint: unknown): string | undefined => {
	const node = constraint as Node | undefined
	return node?.["contype"] === "CONSTR_CHECK" ? (node["conname"] as string | undefined) : undefined
}

/** The names of the CHECKs a column definition declares */
const columnChecks = (column: Node | undefined): Array<string | undefined> =>
	((column?.["constraints"] as Node[] | undefined) ?? []).map((each) => checkName(each["Constraint"]))

/** `name` added to each of `tables` */
function named(facts: Facts, tables: readonly string[], name: string | undefined): void {
	if (name === undefined) return
	for (const table of tables)
		facts.constraintNames.set(table, (facts.constraintNames.get(table) ?? new Set()).add(name))
}

/** The tables a CHECK on `table` reaches: its partitions and theirs, or `table` alone through ONLY */
const reached = (facts: Facts, relation: unknown): string[] => {
	const table = tableOf(relation, facts.schema).key
	return flag((relation as Node)["inh"]) ? lineage(facts, table) : [table]
}

/** A CREATE TABLE's named CHECKs, and those of each parent it is a partition or child of */
function followCreate(node: Node, facts: Facts): void {
	const table = [tableOf(node["relation"], facts.schema).key]
	for (const parent of (node["inhRelations"] as Node[] | undefined) ?? [])
		for (const name of facts.constraintNames.get(tableOf(parent["RangeVar"], facts.schema).key) ?? [])
			named(facts, table, name)
	for (const element of (node["tableElts"] as Node[] | undefined) ?? []) {
		for (const name of columnChecks(element["ColumnDef"] as Node | undefined)) named(facts, table, name)
		named(facts, table, checkName(element["Constraint"]))
	}
}

/** An ALTER TABLE's named CHECKs, added or dropped down the partitions */
function followAlter(node: Node, facts: Facts): void {
	const tables = reached(facts, node["relation"])
	for (const { AlterTableCmd: cmd } of node["cmds"] as Array<{ AlterTableCmd: Node }>) {
		const def = cmd["def"] as Node | undefined
		if (cmd["subtype"] === "AT_DropConstraint")
			for (const table of tables) facts.constraintNames.get(table)?.delete(String(cmd["name"]))
		else if (cmd["subtype"] === "AT_AddConstraint") named(facts, tables, checkName(def?.["Constraint"]))
		else if (cmd["subtype"] === "AT_AddColumn")
			for (const name of columnChecks(def?.["ColumnDef"] as Node | undefined)) named(facts, tables, name)
	}
}

// lookup-table: the objects a rename, a move or a drop names that may be a relation `relations` keeps, and whether the parser gives it as a RangeVar
const RELATION_KINDS: Readonly<Record<string, boolean>> = {
	OBJECT_SEQUENCE: true,
	OBJECT_TABLE: true,
	OBJECT_TYPE: false,
}

/** A rename's or a move's relation, its key now and the key it takes; undefined when `relations` keeps no such key */
function movedRelation(type: string, node: Node, facts: Facts): [string, string] | undefined {
	const kind = String(node[type === "RenameStmt" ? "renameType" : "objectType"])
	const ranged = RELATION_KINDS[kind]
	if (ranged === undefined) return undefined
	const parts = ranged
		? [(node["relation"] as Node)["schemaname"], (node["relation"] as Node)["relname"]].filter(
				(part) => part !== undefined,
			)
		: names(((node["object"] as Node)["List"] as Node)["items"])
	const from = keyOf(parts as string[], facts.schema)
	if (!facts.relations.has(from)) return undefined
	const to =
		type === "RenameStmt"
			? [...(parts as string[]).slice(0, -1), String(node["newname"])]
			: [String(node["newschema"]), (parts as string[]).at(-1) as string]
	return [from, keyOf(to, facts.schema)]
}

/** A rename of a CHECK or of a relation `relations` keeps, or a move of one to another schema */
function followName(type: string, node: Node, facts: Facts): void {
	if (node["renameType"] === "OBJECT_TABCONSTRAINT") {
		const tables = reached(facts, node["relation"]).filter((table) =>
			facts.constraintNames.get(table)?.delete(String(node["subname"])),
		)
		return named(facts, tables, String(node["newname"]))
	}
	const moved = movedRelation(type, node, facts)
	if (moved === undefined) return
	facts.relations.delete(moved[0])
	facts.relations.add(moved[1])
}

/** A DROP of a sequence or a composite type, or of a constraint trigger */
function followDrop(node: Node, facts: Facts): void {
	for (const object of node["objects"] as Node[]) {
		const parts = names((object["List"] as Node | undefined)?.["items"] ?? (object["TypeName"] as Node)["names"])
		if (node["removeType"] === "OBJECT_TRIGGER")
			facts.constraintNames.get(keyOf(parts.slice(0, -1), facts.schema))?.delete(parts.at(-1) as string)
		else facts.relations.delete(keyOf(parts, facts.schema))
	}
}

// lookup-table: the drops that may take a name `followTaken` keeps
const DROPS: ReadonlySet<unknown> = /* @__PURE__ */ new Set(["OBJECT_SEQUENCE", "OBJECT_TRIGGER", "OBJECT_TYPE"])

/**
 * `facts`' relations and constraint names after one statement, read before its indexes are named,
 * as a CHECK a CREATE TABLE writes after a UNIQUE still takes its name first
 */
function followTaken(type: string, node: Node, facts: Facts): void {
	if (type === "CreateSeqStmt") facts.relations.add(tableOf(node["sequence"], facts.schema).key)
	else if (type === "CompositeTypeStmt") facts.relations.add(tableOf(node["typevar"], facts.schema).key)
	else if (type === "CreateStmt") followCreate(node, facts)
	else if (type === "AlterTableStmt") followAlter(node, facts)
	else if (type === "CreateTrigStmt" && flag(node["isconstraint"]))
		named(facts, [tableOf(node["relation"], facts.schema).key], String(node["trigname"]))
	else if (type === "RenameStmt" || type === "AlterObjectSchemaStmt") followName(type, node, facts)
	else if (type === "DropStmt" && DROPS.has(node["removeType"])) followDrop(node, facts)
}

export { followTaken }
