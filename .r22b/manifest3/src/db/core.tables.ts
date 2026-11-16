import { sqliteTable as table } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
export const userAccount = table("user_account", { id: c.id("usr") })
export const post = table("post", {
	id: c.id("pst"),
	author_id: c.ref("author_id").references(() => userAccount.id),
	_owner_id: c.ref("_owner_id").references(() => userAccount.id),
	_token: c.text("_token", { autogenerate: true }),
	title: c.text("title"),
})
