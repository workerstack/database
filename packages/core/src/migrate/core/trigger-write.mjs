/**
 * The write that compiles a trigger: SQLite compiles a trigger's body into the program of each statement of its
 * event on its table or view, so `EXPLAIN` of that statement resolves every name the body uses and every function
 * it calls. A view takes a write only for an event an INSTEAD OF trigger on it fires on; for any other event SQLite
 * answers "cannot modify ... because it is a view", and no program exists to fail. Plain JavaScript, shared by the
 * D1 proof's child (d1-engine-child.mjs), which node runs untransformed, and the SQLite proof (proof-readers.ts).
 */

/** The writes a table takes, in the order the proofs compile them */
export const EVENTS = /** @type {const} */ (["INSERT", "UPDATE", "DELETE"])

/** @param {string} name */
export const quote = (name) => `"${name.replaceAll('"', '""')}"`

/* what in SQL text may spell any word: a comment, a string, a quoted name */
const HIDDEN = /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]/g

/**
 * The event of trigger text `sql`, as sqlite_master holds it: the first bare INSERT, UPDATE or DELETE outside a
 * comment, a string and a quoted name. CREATE TRIGGER's grammar puts the event before ON and the body, and no bare
 * name before it can be one of those keywords
 * @param {string} sql
 * @returns {"DELETE" | "INSERT" | "UPDATE"}
 */
export function triggerEvent(sql) {
	const event = /** @type {RegExpExecArray} */ (/\b(DELETE|INSERT|UPDATE)\b/i.exec(sql.replace(HIDDEN, " ")))
	return /** @type {"DELETE" | "INSERT" | "UPDATE"} */ (/** @type {string} */ (event[1]).toUpperCase())
}

/**
 * The statement of `event` on `table` that compiles each trigger it fires and each generated column it computes:
 * an insert of defaults, an update assigning each of `columns` (the stored and virtual ones, by name) to itself, a
 * delete
 * @param {string} table
 * @param {"DELETE" | "INSERT" | "UPDATE"} event
 * @param {readonly string[]} columns
 */
export function writeOf(table, event, columns) {
	if (event === "INSERT") return `INSERT INTO ${quote(table)} DEFAULT VALUES`
	if (event === "DELETE") return `DELETE FROM ${quote(table)}`
	return `UPDATE ${quote(table)} SET ${columns.map((column) => `${quote(column)} = ${quote(column)}`).join(", ")}`
}
