/**
 * Whether a Postgres statement runs code database does not read: a DO block, a CALL, an EXECUTE, or
 * a call anywhere in it of a function pg-builtins.ts does not know to be pure. What that code does,
 * a VALIDATE or a lock among it, no rating of the statement's text sees, so check's replay measures
 * it (pg-replay-held.ts).
 */
import { PURE_BUILTINS } from "./pg-builtins.ts"
import { names, type Node } from "./pg-nodes.ts"

// lookup-table: the statements that run code their text does not hold
const HIDDEN: ReadonlySet<string> = /* @__PURE__ */ new Set(["CallStmt", "DoStmt", "ExecuteStmt"])

/** Whether a FuncCall names a pure built-in, bare or qualified by pg_catalog */
function pure(call: Node): boolean {
	const name = names(call["funcname"])
	const parts = name[0] === "pg_catalog" ? name.slice(1) : name
	return parts.length === 1 && PURE_BUILTINS.has(parts[0] as string)
}

/** Whether `tree`, a statement's parse tree or a part of it, runs code database does not read */
function runsHiddenCode(tree: unknown): boolean {
	if (Array.isArray(tree)) return tree.some(runsHiddenCode)
	if (typeof tree !== "object" || tree === null) return false
	return Object.entries(tree).some(
		([key, value]) => HIDDEN.has(key) || (key === "FuncCall" && !pure(value as Node)) || runsHiddenCode(value),
	)
}

export { runsHiddenCode }
