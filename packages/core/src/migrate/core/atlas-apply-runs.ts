/**
 * The apply itself, once database approved the pending files: one Atlas call per file, so
 * each file runs on a session of its own, as it would alone, as on SQLite and on D1. No
 * reading of a file proves what it leaves on its session: a trigger, a default, a DO block's EXECUTE
 * or code the target holds can each run a SET that outlives its COMMIT.
 */
import { type Foreign, ownHistory } from "./atlas-foreign.ts"
import { type AtlasFile, type AtlasStatus, checkHistory } from "./atlas-history.ts"
import { APPLY_FORMAT, NON_LINEAR, reported } from "./atlas-report.ts"
import { atlas, type AtlasCommand, atlasStatus } from "./atlas-status.ts"
import { whileStoppable } from "./stopped.ts"

/**
 * After an Atlas call that ran no file and said nothing, once this apply ran `applied`: done once
 * another apply ran the rest, refused while any is pending
 */
async function ranNothing(
	options: AtlasCommand,
	copy: string,
	{ applied, foreign }: { applied: string[]; foreign: Foreign },
) {
	const { pending } = ownHistory(await atlasStatus(options, copy), foreign, copy)
	if (pending.length > 0) {
		const names = pending.map((file) => file.Name).join(", ")
		throw new Error(`atlas migrate apply ran nothing and reported no error, yet still pending: ${names}`)
	}
	if (applied.length === 0) options.print("No migrations to apply")
	return applied
}

/**
 * The approved files the history records and those it does not, read once Atlas's call ended after a
 * stop signal (cleanup.ts runs a child's step before this apply's): what stopped.ts reports
 */
const found =
	(options: AtlasCommand, copy: string, { approved, foreign }: { approved: ReadonlySet<string>; foreign: Foreign }) =>
	async (): Promise<{ applied: string[]; pending: string[] }> => {
		const { pending } = ownHistory(await atlasStatus(options, copy), foreign, copy)
		const left = new Set(pending.map((file) => file.Name))
		return {
			applied: [...approved].filter((name) => !left.has(name)),
			pending: [...approved].filter((name) => left.has(name)),
		}
	}

/**
 * The pending files of `status`, which database approved, applied one Atlas call each: Atlas runs a
 * call's files on one session, where a SET one file makes outlives its COMMIT and reaches the next,
 * a lifted lock_timeout among them, while database rates each file alone. Each later call reads the
 * status and checks the history again first, the guard against another apply between calls, and
 * runs the first file still pending; each runs an approved file not yet run, so the calls are at
 * most the approved files
 */
async function applyRuns(
	options: AtlasCommand,
	copy: string,
	{ foreign, report, status }: { foreign: Foreign; report: Parameters<typeof checkHistory>[2]; status: AtlasStatus },
): Promise<string[]> {
	const approved = new Set(status.pending.map((file) => file.Name))
	/* no further call starts, and the process then ends by the signal, after the report: a stop parks this loop */
	return whileStoppable(
		{ names: [...approved], print: options.print, read: found(options, copy, { approved, foreign }) },
		() => callEach(options, copy, { approved, foreign, report }),
	)
}

/** applyRuns' calls, each of the first file still pending, until every approved file ran */
async function callEach(
	options: AtlasCommand,
	copy: string,
	{ approved, foreign, report }: Omit<Parameters<typeof applyRuns>[2], "status"> & { approved: ReadonlySet<string> },
): Promise<string[]> {
	const applied: string[] = []
	/* the pending are never none here, so they hold a first file */
	let next = [...approved][0] as string
	for (;;) {
		const ran = reported(
			await atlas(options, copy, ["apply", ...NON_LINEAR, "--format", APPLY_FORMAT, "1"]),
			"apply",
			copy,
		)
		if (ran.length === 0) return await ranNothing(options, copy, { applied, foreign })
		if (ran.join("\n") !== next)
			throw new Error(`atlas migrate apply 1 ran ${ran.join(", ")}, not the approved ${next}`)
		options.print(`Apply: ${next}`)
		applied.push(next)
		if (applied.length === approved.size) return applied
		const now = ownHistory(await atlasStatus(options, copy), foreign, copy)
		checkHistory(now, copy, report)
		/* another apply ran the rest */
		if (now.pending.length === 0) return applied
		next = (now.pending[0] as AtlasFile).Name
	}
}

export { applyRuns }
