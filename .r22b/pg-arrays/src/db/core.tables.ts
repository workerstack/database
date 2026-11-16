import * as p from "drizzle-orm/pg-core"
import { c } from "@lovrozagar/comb/pg/columns"
export const mood = p.pgEnum("mood", ["sad", "ok"])
export const row = p.pgTable("row", {
	id: c.id("row"),
	ints: p.integer().array(),
	ints2: p.integer().array("[][]"),
	intsNN: p.integer().array().notNull(),
	txts: p.text().array(),
	vcs: p.varchar({ length: 3 }).array(),
	nums: p.numeric({ precision: 4, scale: 1 }).array(),
	uuids: p.uuid().array(),
	tstzs: p.timestamp({ mode: "string", withTimezone: true }).array(),
	jsbs: p.jsonb().array(),
	enums: mood().array(),
	ctext: c.text("ctext", { max: 3, trim: true }).array(),
	cint: c.integer("cint", { min: 0, max: 10 }).array(),
	creal: c.real("creal").array(),
	bools: p.boolean().array(),
	reals: p.real().array(),
	bigS: p.bigint({ mode: "string" }).array(),
})
