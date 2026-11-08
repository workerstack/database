import { describe, expect, it, vi } from "vitest"
import { deliver, stubKill, until } from "../../../tests/support/signals.ts"
import { hold } from "./cleanup.ts"
import { Refused } from "./refused.ts"
import { Stopped, whileStoppable } from "./stopped.ts"

describe("Stopped", () => {
	it("is a Refused that names its signal", () => {
		const stopped = new Stopped("SIGHUP", "Stopped by SIGHUP", { applied: ["a"], pending: ["b"] })
		expect([stopped instanceof Refused, stopped.signal, stopped.applied, stopped.pending, stopped.unknown]).toEqual([
			true,
			"SIGHUP",
			["a"],
			["b"],
			[],
		])
	})
})

/** SIGTERM during `work` with `read`; what the step printed, what it returned to a step held before it, and the end */
async function stoppedWith(
	kill: ReturnType<typeof stubKill>,
	read: () => Promise<{ applied: string[]; pending: string[] }>,
) {
	const [print, last] = [vi.fn(), vi.fn()]
	const release = hold(last)
	try {
		await whileStoppable({ names: ["a", "b"], print, read }, async () => {
			await deliver("SIGTERM")
			await until(() => kill.calls().length > 0, "the end")
		})
	} finally {
		release()
	}
	return { earlier: last.mock.calls.flatMap(([, earlier]) => earlier as unknown[]), kill: kill.calls(), print }
}

describe("whileStoppable (KC3 of r23)", () => {
	const kill = stubKill()

	it("says which files applied and returns the one report both outputs render", async () => {
		const seen = await stoppedWith(kill, async () => ({ applied: ["a"], pending: ["b"] }))
		const report = new Stopped("SIGTERM", "Stopped by SIGTERM: applied a; not applied b", {
			applied: ["a"],
			pending: ["b"],
		})
		expect([seen.print.mock.calls, seen.earlier, seen.kill]).toEqual([
			[[report.message]],
			[
				expect.objectContaining({
					applied: ["a"],
					message: report.message,
					pending: ["b"],
					signal: "SIGTERM",
					unknown: [],
				}),
			],
			[[process.pid, "SIGTERM"]],
		])
	})

	it("says none for an empty side", async () => {
		const seen = await stoppedWith(kill, async () => ({ applied: [], pending: ["a", "b"] }))
		expect(seen.print.mock.calls).toEqual([["Stopped by SIGTERM: applied none; not applied a, b"]])
	})

	it("names every approved file unknown when it cannot read what was applied", async () => {
		const seen = await stoppedWith(kill, async () => {
			throw new Error("connection refused")
		})
		expect([seen.print.mock.calls, seen.earlier]).toEqual([
			[["Stopped by SIGTERM: comb could not read what was applied: connection refused"]],
			[
				expect.objectContaining({
					applied: [],
					message: "Stopped by SIGTERM: comb could not read what was applied: connection refused",
					pending: [],
					unknown: ["a", "b"],
				}),
			],
		])
	})

	it("returns the work's value and holds no step once it ends", async () => {
		const print = vi.fn()
		expect(
			await whileStoppable({ names: [], print, read: async () => ({ applied: [], pending: [] }) }, async () => 7),
		).toBe(7)
		await deliver("SIGINT")
		await until(() => kill.calls().length > 0, "the end")
		expect(print).not.toHaveBeenCalled()
	})
})
