import { sqliteTable as table } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
import * as z from "zod"
/* a comma list kept as an array */
export const tagsSchema = z.object({ tags: z.string().transform((s) => s.split(",")) })
/* a count of what was sent */
export const lenSchema = z.object({ s: z.string().transform((v) => v.length) })
/* idempotent: trims */
export const trimSchema = z.object({ name: z.string().trim() })
export const row = table("row", {
	id: c.id("row"),
	tags: c.json("tags", tagsSchema).notNull(),
	len: c.json("len", lenSchema).notNull(),
	trim: c.json("trim", trimSchema).notNull(),
})
