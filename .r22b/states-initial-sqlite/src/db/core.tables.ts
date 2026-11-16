import { sqliteTable as table } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
export const STATES = { initial: "queued", terminal: ["done", "failed"], transitions: { queued: ["running"], running: ["done", "failed"] } } as const
export const job = table("job", {
	id: c.id("job"),
	status: c.enum("status", ["queued", "running", "done", "failed"] as const, STATES).notNull().default("queued"),
})
export const task = table("task", {
	id: c.id("task"),
	status: c.enum("status", ["queued", "running", "done", "failed"] as const, STATES).notNull(),
})
