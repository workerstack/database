import * as p from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { c } from "@lovrozagar/comb/pg/columns"
export const row = p.pgTable("row", {
	id: c.id("row"),
	seq: p.integer().generatedAlwaysAsIdentity(),
	byDefault: p.integer().generatedByDefaultAsIdentity(),
	total: p.integer().generatedAlwaysAs(sql`1 + 1`),
	auto: c.text("auto", { autogenerate: true }),
	ser: p.serial(),
})
