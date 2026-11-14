import { describe, expect, it } from "vitest"
import { type At, begin, commit, guarded, ownOf, window } from "./pg-replay-commit.ts"
import { type Hidden, nothingHidden } from "./pg-replay-hidden.ts"
import type { Run } from "./pg-replay-roles.ts"
import { ReplayFailed } from "./replay-failed.ts"

const COUNTS = "SELECT current_setting('track_counts') AS on, coalesce("

/* a snapshot row: its subject's noun and key, the names it is about, and the row */
type Row = [noun: string, key: string, names: string[], row: Record<string, unknown>]

/**
 * A replay's two connections, faked: what the replay connection sent, its shared-catalog counts
 * answering each read in turn, track_counts, whether a function it is asked of is none of pg_catalog's
 * alone (`outside`), and the snapshot the admin connection reads
 */
function runOf(server: { counts?: number[]; on?: string; outside?: boolean; snapshot?: Row[] }): {
	run: Run
	sent: string[]
} {
	const sent: string[] = []
	const counts = [...(server.counts ?? [])]
	const sql = {
		end: async () => undefined,
		unsafe: async (query: string) => {
			sent.push(query)
			if (query.startsWith(COUNTS))
				return [{ on: server.on ?? "on", writes: { pg_authid: String(counts.shift() ?? 0) } }]
			if (query.includes("pg_proc")) return [{ hidden: server.outside ?? false }]
			return []
		},
	}
	const admin = {
		end: async () => undefined,
		unsafe: async () => (server.snapshot ?? []).map(([noun, key, names, row]) => ({ key, names, noun, row })),
	}
	const run: Run = {
		admin,
		created: [],
		createrole: false,
		database: "database_replay_7_9_00000000",
		ours: { rows: new Map(), writes: new Map() },
		owner: "database_replay_7_9",
		role: "dev",
		seen: new Map([["role kept", { names: ["kept"], row: { rolconnlimit: -1 } }]]),
		sql,
		tablespaces: new Set(),
		superuser: false,
	}
	return { run, sent }
}

/* statements that run a DO block, which database cannot read */
const DO: Hidden = { ...nothingHidden(), code: true }

const at = (names: string[], sent?: string, hidden: Hidden = DO): At => ({
	hidden,
	name: "2_b.sql",
	names: new Set(names),
	sent,
	stops: "check stops here",
})

/** Why `ran` refused, or undefined when it passed */
const refusal = (ran: Promise<unknown>): Promise<string | undefined> =>
	ran.then(
		() => undefined,
		(error: Error) => (error instanceof ReplayFailed ? error.message : `not a refusal: ${error.message}`),
	)

describe("begin and commit", () => {
	it("opens a transaction with its counts so far as database's own, and commits one that wrote nothing past its database", async () => {
		const { run, sent } = runOf({ counts: [4, 4], snapshot: [["role", "kept", ["kept"], { rolconnlimit: -1 }]] })
		await begin(run)
		expect(run.ours.writes).toEqual(new Map([["pg_authid", 4]]))
		await commit(run, at(["kept"]))
		expect(sent.filter((query) => !query.startsWith("SELECT"))).toEqual(["BEGIN", "COMMIT"])
	})

	it("refuses a transaction that turned track_counts off, before reading anything else", async () => {
		const { run, sent } = runOf({ on: "off" })
		await begin(run)
		expect(await refusal(commit(run, at([])))).toBe(
			"2_b.sql: the file turned track_counts off, so devUrl's server counted nothing it changed past the database the replay runs in, and database rolled it back and refuses the file; leave track_counts on; check stops here",
		)
		expect(sent).not.toContain("COMMIT")
	})

	it("refuses a transaction its own counts show wrote past its database, naming the statement that did", async () => {
		const { run, sent } = runOf({ counts: [4, 5] })
		await begin(run)
		expect(await refusal(commit(run, at([], "DO $$ BEGIN END $$")))).toMatch(
			/^2_b\.sql: devUrl's server counted a change past the database the replay runs in, made by "DO \$\$ BEGIN END \$\$": .*; check stops here$/,
		)
		expect(sent).not.toContain("COMMIT")
	})
})

/* P2 of r22: the committed shared catalogs, read around a file or a bare statement */
describe("window", () => {
	it("passes a change to an object the file does not name, and reads from it next", async () => {
		const { run } = runOf({ snapshot: [["role", "kept", ["kept"], { rolconnlimit: 5 }]] })
		expect(await refusal(window(run, at(["svc"])))).toBeUndefined()
		expect(run.seen.get("role kept")?.row).toEqual({ rolconnlimit: 5 })
	})

	it.each(["current_user", "current_role", "session_user", "user"])(
		"refuses a change to devUrl's role, which a file names as %s (AE6 of r22)",
		async (word) => {
			const { run } = runOf({ snapshot: [["setting", "every database for dev", ["dev"], { work_mem: "9MB" }]] })
			expect(await refusal(window(run, at([word])))).toContain(
				"database leaves setting every database for dev added on devUrl's server",
			)
		},
	)

	it("passes a change to devUrl's role from a file that names no role by keyword", async () => {
		const { run } = runOf({ snapshot: [["setting", "every database for dev", ["dev"], { work_mem: "9MB" }]] })
		expect(await refusal(window(run, at(["svc"])))).toBeUndefined()
	})

	it("refuses a change the file names beside code database cannot read, and leaves it, as another session may have made it (PR1 of r23)", async () => {
		const { run } = runOf({
			snapshot: [
				["role", "kept", ["kept"], { rolconnlimit: 5 }],
				["role", "svc", ["svc"], {}],
				["database", "Big", ["Big"], {}],
			],
		})
		const refused = await refusal(window(run, at(["kept", "svc", "Big"], "SELECT f()")))
		expect(refused).toMatch(
			/^2_b\.sql: devUrl's server changed past the database the replay runs in while "SELECT f\(\)" ran: database Big added, role kept changed \(rolconnlimit\), role svc added\. /,
		)
		expect(refused).toMatch(
			/apply runs; database leaves database Big added, role kept changed \(rolconnlimit\), role svc added on devUrl's server, as another session may have made those changes: undo there each that is the file's; check stops here$/,
		)
	})

	it("names the whole file when no one statement ran, and leaves out the parts that do not apply", async () => {
		const added = runOf({
			snapshot: [
				["role", "kept", ["kept"], { rolconnlimit: -1 }],
				["role", "svc", ["svc"], {}],
			],
		})
		expect(await refusal(window(added.run, at(["svc"])))).toMatch(
			/while the file ran: role svc added\. .*; database leaves role svc added on devUrl's server, as another session may have made that change: undo there each that is the file's; check stops here$/,
		)
		const changed = runOf({ snapshot: [["role", "kept", ["kept"], { rolconnlimit: 5 }]] })
		expect(await refusal(window(changed.run, at(["kept"])))).toMatch(
			/apply runs; database leaves role kept changed \(rolconnlimit\) on devUrl's server, as another session may have made that change: undo there each that is the file's; check stops here$/,
		)
	})
})

/* PR1 of r23: Postgres keeps no creator for a role or a database, so a change is the file's only beside code database cannot read */
/* devUrl's server after another session made a role and a database the file names */
const NAMED: Row[] = [
	["role", "kept", ["kept"], { rolconnlimit: -1 }],
	["role", "svc", ["svc"], {}],
	["database", "Big", ["Big"], {}],
]

/** Statements that call the functions `names` by a bare name, and run nothing else database cannot read */
const calls = (...names: string[]): Hidden => ({ ...nothingHidden(), calls: new Set(names) })

describe("window beside statements that run only what their parse says", () => {
	it("passes a change to an object the file names when its statements call nothing, asking nothing of the replay's database", async () => {
		const { run, sent } = runOf({ snapshot: NAMED })
		expect(await refusal(window(run, at(["svc", "Big"], undefined, nothingHidden())))).toBeUndefined()
		expect({ seen: run.seen.has("role svc"), sent }).toEqual({ seen: true, sent: [] })
	})

	it("passes one beside a call by a bare name that is pg_catalog's alone on the replay's database", async () => {
		const { run, sent } = runOf({ outside: false, snapshot: NAMED })
		expect(await refusal(window(run, at(["svc"], undefined, calls("pg_sleep"))))).toBeUndefined()
		expect(sent).toEqual([expect.stringContaining("pg_proc")])
	})

	it("refuses one beside a call by a bare name the replay's database holds outside pg_catalog", async () => {
		const { run } = runOf({ outside: true, snapshot: NAMED })
		expect(await refusal(window(run, at(["svc"], undefined, calls("make_side"))))).toContain(
			"while the file ran: role svc added. ",
		)
	})

	it("refuses one beside a call of a function the file makes, asking nothing, as the file may have dropped it since", async () => {
		const { run, sent } = runOf({ outside: false, snapshot: NAMED })
		const hidden = { ...calls("upper"), made: new Set(["upper"]) }
		expect(await refusal(window(run, at(["svc"], undefined, hidden)))).toContain("role svc added")
		expect(sent).toEqual([])
	})
})

/* P3 of r22: only this replay runs in its own database, whatever the file runs */
describe("window on the replay's own database", () => {
	it("refuses a change to the replay's own database whatever the file runs, and drops it with the database", async () => {
		const { run } = runOf({
			snapshot: [
				["role", "kept", ["kept"], { rolconnlimit: -1 }],
				["database", "database_replay_7_9_00000000", ["database_replay_7_9_00000000"], { datistemplate: true }],
				["subscription", "feed", ["feed", "database_replay_7_9_00000000"], {}],
			],
		})
		run.seen.set("database database_replay_7_9_00000000", { names: [run.database], row: { datistemplate: false } })
		const refused = await refusal(window(run, at(["svc"], undefined, nothingHidden())))
		expect(refused).toMatch(
			/ran: database database_replay_7_9_00000000 changed \(datistemplate\), subscription feed added\. .*apply runs; database drops the database it replays in, and subscription feed in it; check stops here$/,
		)
	})

	it("refuses its own database's change alone when the file runs no code database cannot read, and names no other", async () => {
		const { run } = runOf({
			snapshot: [
				["role", "kept", ["kept"], { rolconnlimit: -1 }],
				["role", "svc", ["svc"], {}],
				["database", "database_replay_7_9_00000000", ["database_replay_7_9_00000000"], {}],
			],
		})
		expect(await refusal(window(run, at(["svc"], undefined, nothingHidden())))).toMatch(
			/ran: database database_replay_7_9_00000000 added\. .*apply runs; database drops the database it replays in; check stops here$/,
		)
	})
})

/** A send that fails with `codes` in turn, as the replay's refusal wraps devUrl's error, then passes */
const sends = (...codes: string[]) => {
	const tried = { times: 0 }
	const send = async () => {
		const code = codes[tried.times++]
		if (code !== undefined) throw new ReplayFailed("devUrl refused it", { cause: { code } })
	}
	return { send, tried }
}
const control = (sent: string[]) => sent.filter((query) => !query.startsWith("SELECT"))

/* the amendment to P1 of r22: a txmode none file's statement runs in a transaction of its own first */
describe("guarded", () => {
	it("commits a statement that ran in its transaction", async () => {
		const { run, sent } = runOf({ snapshot: [["role", "kept", ["kept"], { rolconnlimit: -1 }]] })
		const { send, tried } = sends()
		await guarded(run, at([]), send)
		expect({ control: control(sent), tried: tried.times }).toEqual({ control: ["BEGIN", "COMMIT"], tried: 1 })
	})

	it.each(["25001", "2D000"])(
		"rolls back a statement Postgres refuses in a block with %s, and runs it bare",
		async (code) => {
			const { run, sent } = runOf({ snapshot: [["role", "kept", ["kept"], { rolconnlimit: -1 }]] })
			const { send, tried } = sends(code)
			await guarded(run, at([]), send)
			expect({ control: control(sent), tried: tried.times }).toEqual({ control: ["BEGIN", "ROLLBACK"], tried: 2 })
		},
	)

	it("refuses any other failure as it is, without a bare try", async () => {
		const { run, sent } = runOf({})
		const { send, tried } = sends("42P01")
		expect(await refusal(guarded(run, at([]), send))).toBe("devUrl refused it")
		expect({ control: control(sent), tried: tried.times }).toEqual({ control: ["BEGIN"], tried: 1 })
	})
})

/* P3 of r22: the replay's database is dropped after it, so a change to it outlives nothing; P5 and PR6 of r22b: so are the roles it made or adopts */
describe("ownOf", () => {
	const own = ownOf({ ...runOf({}).run, database: "database_replay_1" }, new Set(["made"]))
	const D = "database_replay_1"
	it.each<[string, { fields: string[]; names: Array<string | null> }, boolean]>([
		[`database ${D}`, { fields: ["datacl"], names: [D] }, true],
		[`database ${D}`, { fields: ["datacl", "datistemplate"], names: [D] }, false],
		[`database ${D}`, { fields: ["datdba"], names: [D] }, false],
		[`database ${D}`, { fields: [], names: [D] }, false],
		["database other", { fields: ["datacl"], names: ["other"] }, false],
		[`setting ${D} for every role`, { fields: [], names: [D, null] }, true],
		[`setting ${D} for made`, { fields: [], names: [D, "made"] }, true],
		["setting every database for made", { fields: [], names: [null, "made"] }, true],
		[`setting ${D} for theirs`, { fields: [], names: [D, "theirs"] }, true],
		["setting other for theirs", { fields: [], names: ["other", "theirs"] }, false],
		["setting other for every role", { fields: [], names: ["other", null] }, false],
		[`comment on database ${D}`, { fields: [], names: [D] }, true],
		["comment on database other", { fields: [], names: ["other"] }, false],
		[`security label on database ${D} by selinux`, { fields: [], names: [D] }, true],
		["security label on database other by selinux", { fields: [], names: ["other"] }, false],
		["role made", { fields: ["rolcanlogin"], names: ["made"] }, true],
		["role theirs", { fields: ["rolcanlogin"], names: ["theirs"] }, false],
		["membership made in theirs", { fields: [], names: ["made", "theirs"] }, true],
		["membership theirs in made", { fields: [], names: ["theirs", "made"] }, true],
		["membership theirs in other", { fields: [], names: ["theirs", "other"] }, false],
		["comment on role made", { fields: [], names: ["made"] }, true],
		["comment on role theirs", { fields: [], names: ["theirs"] }, false],
		["security label on role made by selinux", { fields: [], names: ["made"] }, true],
		["tablespace made", { fields: [], names: ["made"] }, false],
	])("rates a change to %s of %j as the replay's own: %s", (subject, { fields, names }, mine) => {
		expect(own({ fields, kind: "changed", names, said: subject, subject })).toBe(mine)
	})
})
