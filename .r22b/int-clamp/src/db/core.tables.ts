import { sqliteTable as table } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
export const row = table("row", {
	id: c.id("row"),
	big: c.integer("big", { max: 1e20 }).notNull(),
	neg: c.integer("neg", { min: -1e20 }).notNull(),
	at: c.timestamp("at", { max: 1e20 }).notNull(),
})
