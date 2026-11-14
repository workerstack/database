import { defineConfig } from "vitest/config"
import { MAX_WORKERS } from "./tests/support/workers.ts"

/* every test run is in UTC, as CI's runners are, so a local stamp vouches for what CI sees; the
   workers forked after this file is read inherit it (tests/structure/workflows.test.ts holds it) */
process.env.TZ = "UTC"

/*
 * The differential suites (tests/differential): lists and the D1 proof built by the tip and by the published
 * 0.21.0 and 0.20.1, checked against the engine itself, over generated cases drawn from a fixed seed list and one
 * fresh seed a run, printed. They install the releases from the npm registry and draw a random seed, so they stay
 * out of `test` and its coverage. `bun run test:differential` runs them and their bun:sqlite twin
 * (tests/bun/differential-lists.test.ts); CI runs it in the `differential` job. An oracle's database ships TypeScript
 * in its box's node_modules, which Node does not strip types from, so vitest transforms it as it does the tip's.
 */
export default defineConfig({
	test: {
		/* one suite at a time: each runs workerd and proof children at once, and side by side they tripled each other's time */
		fileParallelism: false,
		maxWorkers: MAX_WORKERS,
		reporters: ["verbose"],
		projects: [
			{
				test: {
					globalSetup: ["tests/differential/support/global-setup.ts"],
					hookTimeout: 120_000,
					include: ["tests/differential/**/*.test.ts"],
					name: "differential",
					server: { deps: { inline: [/[\\/]@workerstack[\\/]database[\\/]/] } },
					testTimeout: 600_000,
				},
			},
		],
	},
})
