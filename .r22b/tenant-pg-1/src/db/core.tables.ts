import { pgTable as table } from "drizzle-orm/pg-core"
import { c } from "@lovrozagar/comb/pg/columns"
export const org = table("org", { id: c.id("org") })
export const doc = table("doc", {
	id: c.id("doc"),
	orgId: c.ref("orgId", { tenant: true }).notNull(),
	title: c.text("title"),
})
