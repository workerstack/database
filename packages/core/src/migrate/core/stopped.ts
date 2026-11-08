/**
 * The one report of a run a signal stopped: which files applied and which did not, as an
 * object both of a command's outputs render, the human line and the `--json` object. The loop that
 * applies files holds a step for the length of its work; when a signal comes, the step reads what
 * committed once the work in flight has ended, prints the line and returns the report, which the
 * command's own step, held before the loop's and so run after it, reads and prints as JSON. A stop
 * parks the loop itself (cleanup.ts pastStop), so a run it stopped never throws its own report.
 */
import { hold } from "./cleanup.ts"
import { Refused } from "./refused.ts"

/** The files a stop found applied by the run, and left pending */
type Found = { applied: string[]; pending: string[] }

/** A run a signal stopped: the signal, and as a Refused the files it applied, left, or may have applied */
export class Stopped extends Refused {
	readonly signal: NodeJS.Signals

	constructor(signal: NodeJS.Signals, message: string, files: ConstructorParameters<typeof Refused>[1]) {
		super(message, files)
		this.name = "Stopped"
		this.signal = signal
	}
}

const list = (names: readonly string[]) => names.join(", ") || "none"

/**
 * The report of a run `signal` stopped, whose approved files are `names`: what `read` found, or,
 * when it cannot read, every one of `names` as unknown, since any of them may have committed
 */
async function reportOf(
	signal: NodeJS.Signals,
	{ names, read }: { names: readonly string[]; read: () => Promise<Found> },
): Promise<Stopped> {
	try {
		const { applied, pending } = await read()
		return new Stopped(signal, `Stopped by ${signal}: applied ${list(applied)}; not applied ${list(pending)}`, {
			applied,
			pending,
		})
	} catch (error) {
		return new Stopped(
			signal,
			`Stopped by ${signal}: comb could not read what was applied: ${(error as Error).message}`,
			{ pending: [], unknown: names },
		)
	}
}

/**
 * `work`, with a step held while it runs that, on a signal, says on `print` which of `names` the run
 * applied and which it did not, as `read` finds them once the work in flight has ended (cleanup.ts
 * runs a child's own step before this one), and returns the report. The process then ends by the signal.
 */
export async function whileStoppable<T>(
	{ names, print, read }: { names: readonly string[]; print: (line: string) => void; read: () => Promise<Found> },
	work: () => Promise<T>,
): Promise<T> {
	const release = hold(async (signal) => {
		const stopped = await reportOf(signal, { names, read })
		print(stopped.message)
		return stopped
	})
	try {
		return await work()
	} finally {
		release()
	}
}
