/**
 * The statements Postgres runs only inside a transaction block, read from their parse trees: a
 * LOCK, a SAVEPOINT, a RELEASE or ROLLBACK TO one, and a cursor not held past its transaction,
 * which Postgres refuses bare; and a SET TRANSACTION, a SET LOCAL and a SET CONSTRAINTS, which it
 * only warns of bare and then drops. A `txmode none` file's statements are sent bare, as Atlas
 * sends them, so check refuses each outside the file's own BEGIN (pg-scope.ts) and the replay
 * sends it bare (pg-replay.ts). Each is named as Postgres's message names it. Probed on Postgres 17.
 */
import { flag } from "./pg-nodes.ts"

type Node = Record<string, unknown>

/* a DECLARE's option bit for WITH HOLD, as the parser sets it: a cursor kept past its transaction */
const CURSOR_OPT_HOLD = 0x20

/** A SET's name as Postgres's warning gives it: SET TRANSACTION, its SNAPSHOT form and its LOCAL one alike */
function setInside(node: Node): string | undefined {
	if (String(node["name"]).startsWith("TRANSACTION")) return "SET TRANSACTION"
	return flag(node["is_local"]) ? "SET LOCAL" : undefined
}

// lookup-table: each statement Postgres runs only inside a transaction block, by node type, with how its refusal names it
const INSIDE: Readonly<Record<string, (node: Node) => string | undefined>> = {
	ConstraintsSetStmt: () => "SET CONSTRAINTS",
	DeclareCursorStmt: (node) => ((Number(node["options"]) & CURSOR_OPT_HOLD) === 0 ? "DECLARE CURSOR" : undefined),
	LockStmt: () => "LOCK TABLE",
	TransactionStmt: (node) =>
		({
			TRANS_STMT_RELEASE: "RELEASE SAVEPOINT",
			TRANS_STMT_ROLLBACK_TO: "ROLLBACK TO SAVEPOINT",
			TRANS_STMT_SAVEPOINT: "SAVEPOINT",
		})[String(node["kind"])],
	VariableSetStmt: setInside,
}

/** What a statement is, by its parse tree's node `type`, when Postgres runs it only inside a transaction block */
const insideOnly = (type: string, node: Node): string | undefined => INSIDE[type]?.(node)

export { INSIDE, insideOnly }
