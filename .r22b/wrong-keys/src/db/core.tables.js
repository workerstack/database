import { sqliteTable as table } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
export const row = table("row", {
	id: c.id("row"),
	n: c.integer("n", { email: true }).notNull(),
	r: c.real("r", { url: true, trim: true }).notNull(),
	t: c.text("t", { maxBytes: 5 }).notNull(),
	ts: c.timestamp("ts", { password: true, pattern: "/^x$/" }).notNull(),
})
