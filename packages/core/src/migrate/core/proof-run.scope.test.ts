import { afterEach, describe, expect, it, vi } from "vitest"
import { libsqlConnection, type LibsqlConnection } from "../__fixtures__/libsql-connection.ts"
import { scopeCorpus } from "../__fixtures__/scope-corpus.ts"
import { type Proof, provePending } from "./proof-run.ts"
import { asciiFold } from "./sql-code.ts"

vi.mock("bun:sqlite", () => import("../__fixtures__/bun-sqlite-node.ts"))

/* the whole schema's copy: observable answering every object created and every table seeded, as before 8.5 */
const whole = vi.hoisted(() => ({ on: false }))
vi.mock("./proof-scope.ts", async (original) => {
	const real = await original<typeof import("./proof-scope.ts")>()
	return {
		...real,
		observable: (...args: Parameters<typeof real.observable>) => {
			const [objects] = args
			if (!whole.on) return real.observable(...args)
			const tables = objects.filter((object) => object.type === "table")
			return { objects: [...objects], seeded: new Set(tables.map((object) => asciiFold(object.name))) }
		},
	}
})

const open: LibsqlConnection[] = []
afterEach(async () => {
	whole.on = false
	for (const conn of open.splice(0)) await conn.close()
})

/**
 * The proof of each of `files` over a database `schema` made, on the scoped copy or the whole schema's, or the
 * proof's refusal, which no approval overrides (SD1 of r23: a file that leaves a view or trigger unable to run)
 */
async function proofsOf(schema: string, files: readonly string[], scoped: boolean): Promise<Proof[] | string> {
	const conn = libsqlConnection()
	open.push(conn)
	await conn.client.executeMultiple(schema)
	whole.on = !scoped
	try {
		const proofs = await provePending(
			conn,
			files.map((sql, i) => ({ name: `${i + 1}.sql`, sql })),
		)
		return [...proofs.values()]
	} catch (error) {
		// reason: the refusal is the verdict the two copies must agree on
		return (error as Error).message
	}
}

/** Each proof without the tables it lists unproven, or the refusal */
const verdictsOf = (proofs: Proof[] | string) =>
	typeof proofs === "string" ? proofs : proofs.map(({ unproven: _unproven, ...verdict }) => verdict)

/** The tables each proof lists unproven, none for a refusal */
const unprovenOf = (proofs: Proof[] | string) =>
	typeof proofs === "string" ? [] : proofs.map((proof) => proof.unproven)

/* 8.5 of plan 21: the bun:sqlite proof on the scoped copy finds what it finds on the whole schema's, and lists unproven
   only tables the whole copy lists; a refusal, the same words from both */
describe("the bun:sqlite proof answers every corpus file on the scoped copy as on the whole schema's (8.5)", () => {
	it.each(scopeCorpus().map((each) => [each.label, each] as const))("%s", async (_, { files, schema }) => {
		const scoped = await proofsOf(schema, files, true)
		const all = await proofsOf(schema, files, false)
		expect(verdictsOf(scoped)).toEqual(verdictsOf(all))
		for (const [i, listed] of unprovenOf(scoped).entries())
			expect(unprovenOf(all)[i]).toEqual(expect.arrayContaining(listed))
	})
})
