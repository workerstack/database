import { pgTable as table } from "drizzle-orm/pg-core"
import { c } from "@lovrozagar/comb/pg/columns"
export const STATES = { initial: "queued", terminal: ["done", "failed"], transitions: { queued: ["running"], running: ["done", "failed"] } } as const
export const job = table("job", {
	id: c.id("job"),
	status: c.enum("status", ["queued", "running", "done", "failed"] as const, STATES).notNull().default("queued"),
})
export const task = table("task", {
	id: c.id("task"),
	status: c.enum("status", ["queued", "running", "done", "failed"] as const, STATES).notNull(),
})
