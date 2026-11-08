/**
 * Whether the statements a replay's window covers can run code comb cannot read, the only way one
 * makes a change past its database that this backend's counts miss (pg-replay-commit.ts): a DO
 * block, a CALL, an EXECUTE, or a call of a function outside pg_catalog, dblink's among them. A
 * statement whose tree holds none of those runs only what its parse says, and BEYOND and SERVER_CALLS
 * (pg-outside-transaction.ts, pg-server-calls.ts) leave out every such statement that reaches past
 * the database, so a change the server's read shows beside it is another session's. A function
 * called by a bare name is pg_catalog's only where the replay's database holds no other of that name,
 * as an overload in a schema on the search path can take the call, and the file makes none of it.
 * Code Postgres runs for a statement on its own, a trigger, a default, an operator or a cast that
 * calls a function an earlier file defines, is no call in the tree, so it is not read here; what it
 * writes in the replay's transaction its counts still see.
 */
import type { Sql } from "./pg-replay-database.ts"

/**
 * What the statements so far can run that comb cannot read: `code` when one surely can, the
 * functions they call by a bare name (`calls`), which may be pg_catalog's, and those the file makes
 * (`made`). A file's every later window counts what one ran, as a change a DO block makes in the
 * file's own block commits at its COMMIT
 */
type Hidden = { calls: Set<string>; code: boolean; made: Set<string> }

/** Nothing run yet */
const nothingHidden = (): Hidden => ({ calls: new Set(), code: false, made: new Set() })

// lookup-table: the statements that run code the parse does not hold: a DO block's body, a procedure, a prepared statement
const RUNS_CODE: ReadonlySet<string> = /* @__PURE__ */ new Set(["CallStmt", "DoStmt", "ExecuteStmt"])

/** The name parts of a FuncCall's or a CREATE FUNCTION's `funcname`, each a String node, the name last */
const partsOf = (funcname: unknown): string[] =>
	(funcname as Array<{ String: { sval: string } }>).map((part) => part.String.sval)

/** `tree`, a parse tree or a part of one, read `into` */
function readTree(tree: unknown, into: Hidden): void {
	if (tree === null || typeof tree !== "object") return
	for (const [key, value] of Object.entries(tree)) {
		if (RUNS_CODE.has(key)) into.code = true
		else if (key === "FuncCall" || key === "CreateFunctionStmt") {
			const parts = partsOf((value as { funcname: unknown }).funcname)
			/* a funcname holds its name at least */
			const name = parts.at(-1) as string
			if (key === "CreateFunctionStmt") into.made.add(name)
			else if (parts.length === 1) into.calls.add(name)
			else if (parts.length > 2 || parts[0] !== "pg_catalog") into.code = true
		}
		readTree(value, into)
	}
}

/** A statement the replay runs, read `into`: one the parser cannot read may run anything */
function readStatement(tree: unknown, into: Hidden): void {
	if (tree === undefined) into.code = true
	else readTree(tree, into)
}

/* of the functions a JSON array names, whether one is no pg_catalog function, or also one outside it */
const NOT_CATALOG = `SELECT EXISTS (
  SELECT FROM jsonb_array_elements_text($1::text::jsonb) f(name)
  WHERE NOT EXISTS (SELECT FROM pg_proc p WHERE p.proname = f.name AND p.pronamespace = 'pg_catalog'::regnamespace)
    OR EXISTS (SELECT FROM pg_proc p WHERE p.proname = f.name AND p.pronamespace <> 'pg_catalog'::regnamespace)
) AS hidden`

/**
 * Whether what `hidden` holds can run code comb cannot read, a bare name resolved on `sql`, the
 * replay's connection, which sees what its open transaction made
 */
async function runsHidden(sql: Sql, { calls, code, made }: Hidden): Promise<boolean> {
	if (code || [...calls].some((name) => made.has(name))) return true
	if (calls.size === 0) return false
	const rows = await sql.unsafe(NOT_CATALOG, [JSON.stringify([...calls])])
	return rows.some((row) => row["hidden"] === true)
}

export { type Hidden, nothingHidden, readStatement, runsHidden }
