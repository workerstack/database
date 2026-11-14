/**
 * The seeds a differential run draws its cases from: a fixed list, the same on every run, so a finding the
 * expectations name is shown on every run, and one seed new to each run, printed, so runs keep reaching new
 * inputs. `DATABASE_DIFFERENTIAL_SEEDS=4,17` replays exactly the seeds a report printed.
 */

/** A generator of numbers in [0, 1) from `seed` alone (mulberry32), so a seed names the same cases on every run */
export function random(seed: number) {
	let state = seed >>> 0
	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
	}
	return {
		chance: (p: number): boolean => next() < p,
		int: (below: number): number => Math.floor(next() * below),
		pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
	}
}
export type Random = ReturnType<typeof random>

/*
 * The fixed seeds every run walks; each finding the expectations hold shows on at least one of them, on every
 * driver, which each suite's known-red tests hold. 26 is there for QL8-mint on a driver that rounds integers past
 * 2^53, bun:sqlite's and libsql's, which reach it only through a long title.
 */
export const FIXED_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 26]

/** The seeds of one run: the fixed list and one random seed, or exactly those `DATABASE_DIFFERENTIAL_SEEDS` names */
export function runSeeds(env: Record<string, string | undefined> = process.env): {
	fixed: readonly number[]
	fresh: readonly number[]
} {
	const named = env["DATABASE_DIFFERENTIAL_SEEDS"]
	if (named !== undefined && named.trim() !== "") {
		const seeds = named.split(",").map((each) => Number(each.trim()))
		if (seeds.some((seed) => !Number.isSafeInteger(seed))) throw new Error(`DATABASE_DIFFERENTIAL_SEEDS: ${named}`)
		return {
			fixed: seeds.filter((seed) => FIXED_SEEDS.includes(seed)),
			fresh: seeds.filter((seed) => !FIXED_SEEDS.includes(seed)),
		}
	}
	return { fixed: FIXED_SEEDS, fresh: [1000 + Math.floor(Math.random() * 1_000_000_000)] }
}
