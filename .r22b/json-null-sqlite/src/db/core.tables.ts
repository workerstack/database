import { sqliteTable as table } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
import * as z from "zod"
export const prefsSchema = z.object({ theme: z.string() }).nullable()
export const row = table("row", {
	id: c.id("row"),
	prefs: c.json("prefs", prefsSchema).notNull(),
})
