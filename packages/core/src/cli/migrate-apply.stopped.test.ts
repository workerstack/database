/**
 * KC3 of r23: a migrate apply a signal stops says what it applied as the one `--json` object, as it
 * says it as a line without --json, where it printed no object at all. The signal comes as a file
 * is announced (a stop parks the run at its next connection), on a real libsql file.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { deliver, stubKill, until } from "../../tests/support/signals.ts"
import { fakeAtlas, writeSum } from "./__fixtures__/d1.ts"
import { makeIo, projects, runCliWithFakes } from "./__fixtures__/io.ts"

const temp = projects()
afterEach(temp.clean)

const FILES = { "1_a.sql": "CREATE TABLE a (x);", "2_b.sql": "CREATE TABLE b (x);", "3_c.sql": "CREATE TABLE c (x);" }

/** A project with three files over a libsql file */
function project(): string {
	const dir = temp.make()
	mkdirSync(join(dir, "m"))
	for (const [name, sql] of Object.entries(FILES)) writeFileSync(join(dir, "m", name), sql)
	writeSum(join(dir, "m"))
	writeFileSync(
		join(dir, "comb.migrate.config.ts"),
		`export default { databases: { core: { migrationsDir: "./m", name: "core", provider: { type: "libsql", url: ${JSON.stringify(`file:${join(dir, "core.db")}`)} } } } }\n`,
	)
	return dir
}

describe("migrate apply stopped by a signal on a libsql file", () => {
	const kill = stubKill()

	/** The CLI on `argv` with `signal` as the line `at` is written on out or err; once it asked for its end, what it wrote */
	async function stoppedAt(argv: string[], at: string, signal: "SIGHUP" | "SIGINT" | "SIGQUIT" | "SIGTERM") {
		const io = makeIo(project(), fakeAtlas())
		const [out, err] = [io.out, io.err]
		const said = (line: string) => {
			if (line === at) void deliver(signal)
		}
		io.out = (line) => (out(line), said(line))
		io.err = (line) => (err(line), said(line))
		/* the run is parked by the stop and never settles */
		void runCliWithFakes(argv, io)
		await until(() => kill.calls().length > 0, "the end the stop asks for")
		return { errors: io.errors, kill: kill.calls(), outputs: io.outputs }
	}

	it.each(["SIGHUP", "SIGINT", "SIGQUIT", "SIGTERM"] as const)(
		"on %s prints the one JSON object, naming the file that committed and the signal, then ends by the signal",
		async (signal) => {
			const said = await stoppedAt(["migrate", "apply", "core", "--json", "--yes"], "Apply: 2_b.sql", signal)
			const message = `Stopped by ${signal}: applied 1_a.sql; not applied 2_b.sql, 3_c.sql`
			expect(said.outputs.map((line) => JSON.parse(line) as unknown)).toEqual([
				{
					applied: ["1_a.sql"],
					database: "core",
					pending: ["2_b.sql", "3_c.sql"],
					refused: [message],
					stoppedBy: signal,
					unknown: [],
				},
			])
			expect([said.errors.filter((line) => line.startsWith("Stopped by")), said.kill]).toEqual([
				[message],
				[[process.pid, signal]],
			])
		},
	)

	it("says the same as a line, and no JSON, without --json", async () => {
		const said = await stoppedAt(["migrate", "apply", "core", "--yes"], "Apply: 2_b.sql", "SIGTERM")
		expect(said.outputs.filter((line) => line.startsWith("Stopped by"))).toEqual([
			"Stopped by SIGTERM: applied 1_a.sql; not applied 2_b.sql, 3_c.sql",
		])
		expect(said.outputs.some((line) => line.startsWith("{"))).toBe(false)
	})
})

describe("migrate apply --json stopped before any file applied", () => {
	const kill = stubKill()

	it("prints the object with nothing applied and the signal, and says it on stderr", async () => {
		const io = makeIo(project(), () => {
			void deliver("SIGTERM")
			/* parked, as a stop parks the run that started a process */
			return new Promise(() => undefined)
		})
		void runCliWithFakes(["migrate", "apply", "core", "--json", "--yes"], io)
		await until(() => kill.calls().length > 0, "the end the stop asks for")
		expect([io.outputs.map((line) => JSON.parse(line) as unknown), io.errors, kill.calls()]).toEqual([
			[
				{
					applied: [],
					database: "core",
					pending: [],
					refused: ["Stopped by SIGTERM"],
					stoppedBy: "SIGTERM",
					unknown: [],
				},
			],
			["Stopped by SIGTERM"],
			[[process.pid, "SIGTERM"]],
		])
	})

	it("prints one object when the run fails as the signal comes", async () => {
		const io = makeIo(project(), () => {
			void deliver("SIGTERM")
			return Promise.reject(new Error("atlas exploded"))
		})
		await runCliWithFakes(["migrate", "apply", "core", "--json", "--yes"], io)
		await until(() => kill.calls().length > 0, "the end the stop asks for")
		expect(io.outputs).toHaveLength(1)
	})
})
