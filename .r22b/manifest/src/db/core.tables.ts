import { pgSchema, pgTable, integer } from "drizzle-orm/pg-core"
import { c } from "@lovrozagar/comb/pg/columns"
export const app = pgSchema("app")
export const org = app.table("org", { id: c.id("org") })
export const team = pgTable("team", { id: c.id("tem") })
export const member = pgTable("member", {
	id: c.id("mem"),
	orgId: c.ref("org_ref").references(() => org.id),
	teamId: c.ref("team_ref", { mutable: true }).references(() => team.id),
	_secretTeam: c.ref("secret_team").references(() => team.id),
	_hidden: c.text("hidden_note"),
	seq: integer("seq").generatedAlwaysAsIdentity(),
	created_at: c.createdAt("created_at"),
})
