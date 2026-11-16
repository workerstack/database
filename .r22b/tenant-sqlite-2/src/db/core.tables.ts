import { sqliteTable as table } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
export const org = table("org", { id: c.id("org") })
export const doc = table("doc", {
	id: c.id("doc"),
	orgId: c.integer("orgId", { tenant: true }).notNull(),
	title: c.text("title"),
})
