/**
 * The generator of D1 proof cases: a live schema of plain tables, views over them and over each other, and
 * triggers that write one table when another is written or that make a view writable (INSTEAD OF, for some of a
 * view's events), and one pending file that drops, renames and adds what those triggers and views use. Every
 * file is approved (each version's `allow-unsafe` marker, and check runs with --yes), so database's verdict is its proof's alone. A
 * case is plain SQL, so every version checks the same text (proof.ts).
 */
import { approvalOf, ORACLES } from "./oracles.ts"
import type { Random } from "./random.ts"

/** One case: the live schema's statements, with a row in each table, and the pending file */
export type ProofCase = { base: string; file: string; ops: readonly string[] }

type Table = { columns: string[]; name: string }
type View = { name: string; sql: string }
type Trigger = { name: string; on: string; sql: string }
type Schema = { tables: Table[]; triggers: Trigger[]; views: View[] }

const EVENTS = ["INSERT", "UPDATE", "DELETE"] as const
type Event = (typeof EVENTS)[number]

/*
 * the approval every file carries, so no rule of database's that an operator can approve refuses it: the tip's line and
 * each pinned release's own (a release reads only its brand's marker), so every version checks the same text
 */
export const APPROVED = [
	...new Set(["-- database:allow-unsafe: the differential approves every file\n", ...ORACLES.map(approvalOf)]),
].join("")

const tableSql = ({ columns, name }: Table): string =>
	`CREATE TABLE ${name} (id INTEGER PRIMARY KEY, ${columns.map((column) => `${column} TEXT`).join(", ")});`

/** A view over a table's or a view's first column, or a join of two tables */
function viewOf(random: Random, schema: Schema, name: string): View {
	const sources = [...schema.tables.map((table) => table.name), ...schema.views.map((view) => view.name)]
	const [left, right] = [random.pick(schema.tables), random.pick(schema.tables)]
	const sql =
		random.chance(0.25) && left !== right
			? `CREATE VIEW ${name} AS SELECT ${left.name}.id AS id, ${left.name}.${left.columns[0]} AS a, ${right.name}.${right.columns[0]} AS b FROM ${left.name} JOIN ${right.name} ON ${right.name}.id = ${left.name}.id;`
			: `CREATE VIEW ${name} AS SELECT * FROM ${random.pick(sources)};`
	return { name, sql }
}

/** A trigger after `event` on a table that writes another table, or reads a view as it does */
function writerOf(random: Random, schema: Schema, on: Table, event: Event): Trigger {
	/* the schema holds two tables or more, and a file that drops all but one adds no writer to it */
	const others = schema.tables.filter((table) => table !== on)
	const target = others.length > 0 ? random.pick(others) : on
	const row = event === "DELETE" ? "old" : "new"
	const name = `${on.name}_${event.toLowerCase()}_${target.name}`
	const view = schema.views.length > 0 && random.chance(0.3) ? random.pick(schema.views) : undefined
	const body =
		view !== undefined
			? `INSERT INTO ${target.name} (${target.columns[0]}) SELECT count(*) FROM ${view.name};`
			: `INSERT INTO ${target.name} (${target.columns[0]}) VALUES (${row}.${on.columns[0]});`
	return { name, on: on.name, sql: `CREATE TRIGGER ${name} AFTER ${event} ON ${on.name} BEGIN ${body} END;` }
}

/** An INSTEAD OF trigger for `event` on `view`, writing the table under it */
function insteadOf(schema: Schema, view: View, event: Event): Trigger {
	const table = schema.tables.find((each) => view.sql.includes(` ${each.name}`)) ?? (schema.tables[0] as Table)
	const column = table.columns[0]
	const body = {
		DELETE: `DELETE FROM ${table.name} WHERE id = old.id;`,
		INSERT: `INSERT INTO ${table.name} (${column}) VALUES (new.id);`,
		UPDATE: `UPDATE ${table.name} SET ${column} = new.id WHERE id = old.id;`,
	}[event]
	const name = `${view.name}_instead_${event.toLowerCase()}`
	return { name, on: view.name, sql: `CREATE TRIGGER ${name} INSTEAD OF ${event} ON ${view.name} BEGIN ${body} END;` }
}

/** The live schema: two or three tables, up to two views and up to three triggers, some making a view writable */
function baseOf(random: Random): Schema {
	const schema: Schema = { tables: [], triggers: [], views: [] }
	for (let index = 1; index <= 2 + random.int(2); index++)
		schema.tables.push({ columns: ["a", "b"].slice(0, 1 + random.int(2)), name: `t${index}` })
	for (let index = 1; index <= random.int(3); index++) schema.views.push(viewOf(random, schema, `v${index}`))
	for (let index = 0; index < random.int(3); index++) {
		const trigger = writerOf(random, schema, random.pick(schema.tables), random.pick(EVENTS))
		if (!schema.triggers.some((each) => each.name === trigger.name)) schema.triggers.push(trigger)
	}
	for (const view of schema.views) {
		if (!random.chance(0.3)) continue
		for (const event of EVENTS) if (random.chance(0.5)) schema.triggers.push(insteadOf(schema, view, event))
	}
	return schema
}

const sqlOf = (schema: Schema): string =>
	[
		...schema.tables.map(tableSql),
		...schema.views.map((view) => view.sql),
		...schema.triggers.map((trigger) => trigger.sql),
		...schema.tables.map((table) => `INSERT INTO ${table.name} (${table.columns[0]}) VALUES ('${table.name}');`),
	].join("\n")

/**
 * One operation of the file on `schema`, which it updates as SQLite would where the operation succeeds, and the
 * statements it adds; the file may break what it leaves, or fail, and the truth (proof.ts) is what D1 then does
 */
function operate(random: Random, schema: Schema, step: number): string[] {
	const table = random.pick(schema.tables)
	const view = schema.views.length > 0 ? random.pick(schema.views) : undefined
	const kind = random.pick([
		"drop-table",
		"drop-view",
		"rename-table",
		"rename-column",
		"drop-column",
		"add-column",
		"add-view",
		"add-instead",
		"add-writer",
		"drop-trigger",
	] as const)
	switch (kind) {
		case "drop-table":
			schema.tables = schema.tables.filter((each) => each !== table)
			schema.triggers = schema.triggers.filter((each) => each.on !== table.name)
			return [`DROP TABLE ${table.name};`]
		case "drop-view":
			if (view === undefined) return []
			schema.views = schema.views.filter((each) => each !== view)
			schema.triggers = schema.triggers.filter((each) => each.on !== view.name)
			return [`DROP VIEW ${view.name};`]
		case "rename-table": {
			const name = `${table.name}_r${step}`
			const statement = `ALTER TABLE ${table.name} RENAME TO ${name};`
			table.name = name
			return [statement]
		}
		case "rename-column": {
			const column = random.pick(table.columns)
			const name = `${column}_r${step}`
			table.columns = table.columns.map((each) => (each === column ? name : each))
			return [`ALTER TABLE ${table.name} RENAME COLUMN ${column} TO ${name};`]
		}
		case "drop-column": {
			if (table.columns.length < 2) return []
			const column = random.pick(table.columns)
			table.columns = table.columns.filter((each) => each !== column)
			return [`ALTER TABLE ${table.name} DROP COLUMN ${column};`]
		}
		case "add-column":
			table.columns.push(`c${step}`)
			return [`ALTER TABLE ${table.name} ADD COLUMN c${step} TEXT;`]
		case "add-view": {
			const added = viewOf(random, schema, `w${step}`)
			schema.views.push(added)
			return [added.sql]
		}
		case "add-instead": {
			if (view === undefined) return []
			const events = EVENTS.filter(
				(event) =>
					random.chance(0.5) &&
					!schema.triggers.some((each) => each.name === `${view.name}_instead_${event.toLowerCase()}`),
			)
			const added = events.map((event) => insteadOf(schema, view, event))
			schema.triggers.push(...added)
			return added.map((trigger) => trigger.sql)
		}
		case "add-writer": {
			const added = writerOf(random, schema, table, random.pick(EVENTS))
			if (schema.triggers.some((each) => each.name === added.name)) return []
			schema.triggers.push(added)
			return [added.sql]
		}
		case "drop-trigger": {
			if (schema.triggers.length === 0) return []
			const trigger = random.pick(schema.triggers)
			schema.triggers = schema.triggers.filter((each) => each !== trigger)
			return [`DROP TRIGGER ${trigger.name};`]
		}
	}
}

/** One case drawn from `random`: a live schema and a file of one to three operations on it, none empty */
export function proofCase(random: Random): ProofCase {
	const schema = baseOf(random)
	const base = sqlOf(schema)
	const statements: string[] = []
	for (let step = 1; step <= 1 + random.int(3) || statements.length === 0; step++)
		statements.push(...operate(random, schema, step))
	return { base, file: `${APPROVED}${statements.join("\n")}\n`, ops: statements }
}
