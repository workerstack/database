import { pgTable as table } from "drizzle-orm/pg-core"
import { c } from "@lovrozagar/comb/pg/columns"
export const row = table("row", {
	id: c.id("row"),
	
	t: c.text("t"), tNN: c.text("tNN").notNull(),
	tMin: c.text("tMin", { min: 7 }).notNull(), tMax3: c.text("tMax3", { max: 3 }).notNull(), tMax0: c.text("tMax0", { max: 0 }),
	tUp: c.text("tUp", { uppercase: true, max: 6 }).notNull(), tLow: c.text("tLow", { lowercase: true, min: 6, max: 6 }).notNull(),
	tTrim: c.text("tTrim", { trim: true, min: 50 }).notNull(), nm: c.text("nm", { name: true, min: 10 }).notNull(),
	email: c.text("email", { email: true }).notNull(), emailMin: c.text("emailMin", { email: true, min: 17 }),
	url: c.text("url", { url: true, max: 19 }), img: c.text("img", { imageUri: true }),
	en: c.enum("en", ["b", "a"] as const).notNull(),
	i: c.integer("i"), iLo: c.integer("iLo", { max: 41 }), iFrac: c.integer("iFrac", { min: 0.5, max: 1.5 }),
	iNeg: c.integer("iNeg", { min: -10, max: -5 }), iBig: c.integer("iBig", { min: 2147483000 }),
	r: c.real("r"), rTiny: c.real("rTiny", { min: 1e-7, max: 2e-7 }), rNeg: c.real("rNeg", { max: -1 }), rEq: c.real("rEq", { min: 0.3, max: 0.3 }),
	ts: c.timestamp("ts", { min: 2000000000000 }), tsNeg: c.timestamp("tsNeg", { max: -1 }),
	b: c.boolean("b").notNull(),
	ser: c.integer("ser"),
})
