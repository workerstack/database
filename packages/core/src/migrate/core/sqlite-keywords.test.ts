import { createClient } from "@libsql/client"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { NEVER_NAMES } from "./sqlite-keywords.ts"

/** What names the grammar takes: each statement makes `word` a table, a column, an index or an alias */
const AS_NAME = [
	(word: string) => `CREATE TABLE ${word} (x)`,
	(word: string) => `CREATE TABLE t (${word})`,
	(word: string) => `CREATE INDEX ${word} ON base (x)`,
	(word: string) => `SELECT * FROM base ${word}`,
]

describe("NEVER_NAMES", () => {
	it("is in order, lower case and whole", () => {
		const words = [...NEVER_NAMES]
		expect(words).toEqual([...words].sort())
		expect(words.every((word) => word === word.toLowerCase() && /^[a-z_]+$/.test(word))).toBe(true)
		expect(words).toHaveLength(56)
	})

	it.each(AS_NAME.map((statement, at) => [at, statement] as const))(
		"holds only words node:sqlite's SQLite refuses as a bare name (statement %i)",
		(_, statement) => {
			const db = new DatabaseSync(":memory:")
			db.exec("CREATE TABLE base (x)")
			const accepted = [...NEVER_NAMES].filter((word) => {
				try {
					db.exec(statement(word))
					return true
				} catch {
					return false
				}
			})
			db.close()
			expect(accepted).toEqual([])
		},
	)

	it.each(AS_NAME.map((statement, at) => [at, statement] as const))(
		"holds only words libsql's SQLite refuses as a bare name (statement %i)",
		async (_, statement) => {
			const client = createClient({ url: ":memory:" })
			try {
				await client.execute("CREATE TABLE base (x)")
				const accepted: string[] = []
				for (const word of NEVER_NAMES) {
					try {
						await client.execute(statement(word))
						accepted.push(word)
					} catch {
						// reason: a refusal is what the list claims
					}
				}
				expect(accepted).toEqual([])
			} finally {
				client.close()
			}
		},
	)
})
