/**
 * The replay's transactions and the reads around them (pg-replay.ts): a file's or comb's own
 * statement's transaction, refused before its COMMIT when this backend's counts show it wrote past
 * its database, and the server's shared catalogs read as committed around it and around
 * every bare statement, a change there the file's when it is to the replay's own database, or to an
 * object the file names beside a statement that can run code comb cannot read;
 * a `txmode none` file's statement in a transaction of its own first, bare only when
 * Postgres runs it outside a block alone.
 */
import { adopt, bareAgain, type Run } from "./pg-replay-roles.ts"
import { type Hidden, runsHidden } from "./pg-replay-hidden.ts"
import { type Snapshot, snapshot, snapshotChanges, subscriptionsIn } from "./pg-server-snapshot.ts"
import {
	type Change,
	catalogsOf,
	counts,
	type Own,
	refusedChanges,
	rowChanges,
	writesSince,
} from "./pg-server-writes.ts"
import { ReplayFailed } from "./replay-failed.ts"

/**
 * A transaction opened on the replay's connection, its counts so far taken as comb's own: a backend
 * keeps a committed transaction's counts in the next one's read until it flushes them, which it
 * never does inside a transaction
 */
async function begin(run: Run): Promise<void> {
	/* pipelined on the one connection: the read runs in the transaction BEGIN opens, a round trip saved */
	const [, now] = await Promise.all([run.sql.unsafe("BEGIN", []), counts(run.sql)])
	run.ours = { rows: new Map(), writes: now.writes }
}

/**
 * Where a replayed transaction or bare statement is: its file's name and the names it spells, what
 * its statements so far can run that comb cannot read (`hidden`), the statement, if bare, and what a
 * refusal stops; told each role the transaction adds that the replay adopts
 */
type At = {
	adopted?: ((role: string) => void) | undefined
	hidden: Hidden
	name: string
	names: ReadonlySet<string>
	sent: string | undefined
	stops: string
}

/* the words that name devUrl's role in a file, as namesIn folds them: CURRENT_USER and its kin */
const SESSION_ROLE = ["current_role", "current_user", "session_user", "user"]

/** The objects the file `names`, devUrl's role among them where it names that by keyword */
function spelled(run: Run, names: ReadonlySet<string>): Set<string> {
	const its = new Set(names)
	if (SESSION_ROLE.some((word) => names.has(word))) its.add(run.role)
	return its
}

/**
 * The server's shared catalogs read as committed against the last read: a change since to the
 * replay's own database, or to what it holds, is the file's, as only this replay runs in it, and the
 * cleanup drops it. A change to an object the file names is the file's when its statements so far
 * can run code comb cannot read (pg-replay-hidden.ts), the one way a change past the database gets by
 * the counts, and is refused, but no cleanup drops it: Postgres keeps no creator for a role or a
 * database, and another session may have made it. A change to any other object, or beside statements
 * that run only what their parse says, is another session's. `read` is that read when the caller took it
 */
async function window(run: Run, at: At, read?: Snapshot): Promise<void> {
	const now = read ?? (await snapshot(run.admin))
	strayed(run, { ...at, hid: await hides(run, at, now) }, now)
}

/* whether a change in `now` to an object the file names may be the file's, as its statements can run code comb cannot read */
const hides = (run: Run, { hidden, names }: At, now: Snapshot): boolean | Promise<boolean> =>
	snapshotChanges(run.seen, now, spelled(run, names)).length > 0 && runsHidden(run.sql, hidden)

/**
 * window's verdict on `now`, the server's shared catalogs as committed after the file or `sent`,
 * against the last read, the objects the file names counted when it `hid` code comb cannot read;
 * kept apart from window's await, as v8 miscounts a branch after an await
 */
function strayed(run: Run, { hid, name, names, sent, stops }: At & { hid: boolean }, now: Snapshot): void {
	const replays = new Set([run.database])
	const changes = snapshotChanges(run.seen, now, hid ? new Set([...spelled(run, names), ...replays]) : replays)
	const own = new Set(snapshotChanges(run.seen, now, replays))
	const within = subscriptionsIn(run.seen, now, run.database)
	run.seen = now
	if (changes.length === 0) return
	const dropped =
		own.size > 0
			? `; comb drops the database it replays in${within.length === 0 ? "" : `, and ${within.join(", ")} in it`}`
			: ""
	const kept = changes.filter((change) => !own.has(change))
	const left =
		kept.length === 0
			? ""
			: `; comb leaves ${kept.join(", ")} on devUrl's server, as another session may have made ${kept.length === 1 ? "that change" : "those changes"}: undo there each that is the file's`
	throw new ReplayFailed(
		`${name}: devUrl's server changed past the database the replay runs in while ${sent === undefined ? "the file" : JSON.stringify(sent)} ran: ${changes.join(", ")}. A change made there, from inside a DO block, a function, EXECUTE or CALL, or over a second connection such as dblink's, apply would make on the target's server, so comb refuses the file; write the change as a statement of its own, which the replay leaves out and apply runs${dropped}${left}; ${stops}`,
	)
}

// lookup-table: the fields of a database's row whose change keeps the cleanup from dropping it: a template, another owner
const UNDROPPABLE: ReadonlySet<string> = /* @__PURE__ */ new Set(["datdba", "datistemplate"])

// lookup-table: by a change's noun, where its row's names hold the roles whose drop takes the row with it
const ROLE_AT: ReadonlyArray<[noun: string, at: readonly number[]]> = [
	["comment on role ", [0]],
	["membership ", [0, 1]],
	["role ", [0]],
	["security label on role ", [0]],
	["setting ", [1]],
]

/**
 * Which changes are the replay's own, one rule: a change whose subject is what the replay drops
 * after it, so nothing outlives the check. The database it runs in: its row, but a field
 * that keeps the cleanup from dropping it, every role's settings in it, and its comment and security
 * labels. And each of `roles`, those it made or adopts: its row, a
 * membership in it or of it, its settings in any database, and its comment and security labels
 */
function ownOf(run: Run, roles: ReadonlySet<string>): Own {
	const database = `database ${run.database}`
	return ({ fields, names, subject }) =>
		(subject === database && fields.length > 0 && !fields.some((field) => UNDROPPABLE.has(field))) ||
		subject.startsWith(`setting ${run.database} for `) ||
		subject === `comment on ${database}` ||
		subject.startsWith(`security label on ${database} by `) ||
		(ROLE_AT.find(([noun]) => subject.startsWith(noun))?.[1] ?? []).some((at) => roles.has(names[at] ?? ""))
}

/** The roles the `changes` to pg_authid added: a row no role held before, which the replay may adopt */
const addedRoles = (changes: readonly Change[] = []): string[] =>
	changes.filter((change) => change.kind === "added").map((change) => String(change.names[0]))

/** The roles of `roles` whose own row `changes` to pg_authid added or changed, which the replay makes bare again */
const touchedRoles = (roles: ReadonlySet<string>, changes: readonly Change[] = []): string[] =>
	changes
		.filter((change) => change.kind !== "removed" && roles.has(String(change.names[0])))
		.map((change) => String(change.names[0]))

/**
 * The open transaction committed, or refused, with nothing committed, when it wrote past its
 * database, by its own counts or the server's catalogs: in `name`, by `sent` when the transaction is
 * that one statement's
 */
async function commit(run: Run, at: At): Promise<void> {
	const { name, sent, stops } = at
	/* two connections, one moment before COMMIT: the counts on the replay's, the committed catalogs on admin's, a round trip saved */
	const [now, read] = await Promise.all([counts(run.sql), snapshot(run.admin)])
	/* a superuser's file can turn the counts off for its transaction or its session */
	if (!now.on)
		throw new ReplayFailed(
			`${name}: the file turned track_counts off, so devUrl's server counted nothing it changed past the database the replay runs in, and comb rolled it back and refuses the file; leave track_counts on; ${stops}`,
		)
	const counted = writesSince(now.writes, run.ours.writes)
	const byCatalog =
		counted.size === 0
			? new Map<string, Change[]>()
			: await rowChanges({ catalogs: catalogsOf(run.superuser), sql: run.sql, was: run.admin }, counted, run.ours.rows)
	const adopting = addedRoles(byCatalog.get("pg_authid"))
	const roles = new Set([...run.created, ...adopting])
	const changes = refusedChanges(byCatalog, ownOf(run, roles))
	if (changes.length > 0) {
		const by = sent === undefined ? "" : `, made by ${JSON.stringify(sent)}`
		throw new ReplayFailed(
			`${name}: devUrl's server counted a change past the database the replay runs in${by}: ${changes.join(", ")}. It came from inside a statement the replay cannot leave out (a DO block, a function, EXECUTE or CALL), and apply would make it on the target's server, so comb rolled it back and refuses the file. A role such a statement adds, and a change to a role the replay made, are the replay's own, as it drops them after; for any other change, write it as a statement of its own: the replay leaves out one that reaches past its database, and apply runs it, while a CREATE ROLE runs in the replay, the role made bare; ${stops}`,
		)
	}
	await bareAgain(run, touchedRoles(roles, byCatalog.get("pg_authid")))
	await adopt(run, adopting)
	for (const role of adopting) at.adopted?.(role)
	await window(run, at, read)
	await run.sql.unsafe("COMMIT", [])
}

// lookup-table: the codes Postgres refuses a statement with in a transaction block that it runs bare: an outside-only class (25001), a COMMIT inside a DO block or a procedure (2D000)
const BARE_ONLY: ReadonlySet<unknown> = /* @__PURE__ */ new Set(["25001", "2D000"])

/**
 * A statement of a `txmode none` file `send` runs, first in a transaction of its own, refused before
 * its COMMIT as a file's is: a change it makes past its database never
 * commits. Postgres refuses only an outside-only class and a COMMIT inside a DO block or a procedure
 * in a block; that try rolled back whole, so it runs bare, as Atlas sends it, with the server's
 * catalogs read around it
 */
async function guarded(run: Run, at: At, send: () => Promise<void>): Promise<void> {
	await begin(run)
	const refused = await send().then(
		() => undefined,
		(error: unknown) => error,
	)
	if (refused === undefined) return commit(run, at)
	if (!BARE_ONLY.has((refused as { cause?: { code?: unknown } | undefined }).cause?.code)) throw refused
	await run.sql.unsafe("ROLLBACK", [])
	await send()
	return window(run, at)
}

export { type At, begin, commit, guarded, ownOf, window }
