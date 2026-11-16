import { pgSchema, pgTable, integer, serial } from "drizzle-orm/pg-core"
import { c } from "@lovrozagar/comb/pg/columns"
export const app = pgSchema("app")
export const appTeam = app.table("team", { id: c.id("atm") })
export const team = pgTable("team", { id: c.id("tem") })
export const member = pgTable("member", {
	id: c.id("mem"),
	teamId: c.ref("team_ref").references(() => appTeam.id),
	seq: integer("seq").generatedAlwaysAsIdentity(),
	byDefault: integer("by_default").generatedByDefaultAsIdentity(),
	ser: serial("ser"),
	created_at: c.createdAt("created_at"),
})
