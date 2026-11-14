/**
 * What a failed `wrangler d1 migrations apply` says, read for the refusal database gives, and the refusal
 * of a run whose table records other than the files database checked.
 */
import { LOCKER } from "../drivers/d1-lock.ts"
import { Refused } from "./refused.ts"

type Ran = { stderr: string; stdout: string }

/** wrangler's own error lines from a failed run, its colours and banner left out; its whole output when it printed none */
export function wranglerError({ stderr, stdout }: Ran): string {
	/* the escape sequences that colour a terminal's text */
	const output = `${stderr}${stdout}`.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
	const errors = output.split("\n").filter((line) => line.includes("[ERROR]"))
	return (errors.length > 0 ? errors.map((line) => line.trim()).join("; ") : output).trim()
}

/**
 * Why a failed apply failed. When it `locked` out on a --local target (d1-lock.ts lockedOut), another process held
 * the file's write lock: wrangler runs its batch once and names only an internal error, so the lock is named here and
 * never waited out, since database cannot know the batch did nothing, and what the table holds says what is still pending.
 */
export function applyFailure(ran: Ran, locked: boolean): string {
	return locked
		? `the local D1 database was locked by ${LOCKER} while wrangler applied: let it finish and rerun`
		: wranglerError(ran)
}

/** Refuse a failed run, or one whose table gained (`added`) other than the `names` checked, naming a file never checked */
export function refuseUnlike(
	ran: { code: number; stderr: string; stdout: string },
	{ added, locked, names, table }: { added: string[]; locked: boolean; names: string[]; table: string },
): void {
	const unchecked = added.filter((name) => !names.includes(name))
	const rest = names.filter((name) => !added.includes(name))
	const also =
		unchecked.length === 0
			? ""
			: `; wrangler also applied ${unchecked.join(", ")}, which database never checked and holds no hash for: check each against git, then run database migrate baseline <db> --hashes`
	const now = { applied: added, pending: rest }
	if (ran.code !== 0) throw new Refused(`wrangler d1 migrations apply failed: ${applyFailure(ran, locked)}${also}`, now)
	if (unchecked.length > 0 || rest.length > 0) {
		throw new Refused(
			`wrangler recorded ${added.join(", ") || "nothing"} in ${table}, where database checked ${names.join(", ")}; wrangler said: ${wranglerError(ran)}${also}`,
			now,
		)
	}
}
