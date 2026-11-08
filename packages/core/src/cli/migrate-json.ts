/**
 * `--json` for `migrate apply|baseline|check|status`: the human lines go to stderr and stdout is one
 * JSON object, the database, the files applied (or found applied) and pending, what was refused, and
 * the files whose answer was lost, which may have committed; a refusal still exits 1. A run a signal
 * stopped (SIGHUP, SIGINT, SIGQUIT, SIGTERM) prints that object too, once the loop that applies files
 * has said what committed (stopped.ts), with `stoppedBy` naming the signal, and then ends by the
 * signal. A stop parks the run itself, so that object comes from the step held here.
 */
import { hold } from "../migrate/core/cleanup.ts"
import { Refused } from "../migrate/core/refused.ts"
import { Stopped } from "../migrate/core/stopped.ts"
import { type CliContext, type MigrateOutcome, Reported } from "./output.ts"

/** One end of a run, as the object prints it */
type End = MigrateOutcome & { refused: string[]; stoppedBy?: NodeJS.Signals | undefined; unknown: string[] }

/** `run` on `db`, its human lines on stderr and its one JSON object on `io.out` */
export async function asJson(
	db: string,
	io: CliContext,
	run: (io: CliContext) => Promise<MigrateOutcome>,
): Promise<void> {
	/* once: a run that fails as a signal stops it must not print a second object */
	let printed = false
	const report = ({ applied, pending, refused, stoppedBy, unknown }: End) => {
		if (printed) return
		printed = true
		io.out(JSON.stringify({ applied, database: db, pending, refused, ...(stoppedBy && { stoppedBy }), unknown }))
	}
	/* held before the run, so it runs after every step the run holds: they have said what committed by then */
	const release = hold((signal, earlier) => {
		const found = earlier.find((each) => each instanceof Stopped)
		/* a stop before any file applied: nothing committed, and no loop has a report to give */
		const stopped = found ?? new Stopped(signal, `Stopped by ${signal}`, { pending: [] })
		if (found === undefined) io.err(stopped.message)
		report({ ...stopped, refused: [stopped.message], stoppedBy: signal, unknown: stopped.unknown })
	})
	try {
		report({ ...(await run({ ...io, out: io.err })), refused: [], unknown: [] })
	} catch (error) {
		/* a refusal or a failed command is an Error; a user's config can throw anything */
		const { applied, pending, unknown } = error instanceof Refused ? error : { applied: [], pending: [], unknown: [] }
		report({ applied, pending, refused: [error instanceof Error ? error.message : String(error)], unknown })
		throw new Reported(error)
	} finally {
		release()
	}
}
