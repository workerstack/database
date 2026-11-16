import * as p from "drizzle-orm/pg-core"
import { c } from "@lovrozagar/comb/pg/columns"
export const row = p.pgTable("row", {
	id: c.id("row"),
	timetz: p.time({ withTimezone: true }),
	timetz3: p.time({ withTimezone: true, precision: 3 }),
	ivDay: p.interval({ fields: "day" }),
	ivYM: p.interval({ fields: "year to month" }),
	ivSec0: p.interval({ precision: 0 }),
	ts0: p.timestamp({ mode: "string", precision: 0 }),
	time0: p.time({ precision: 0 }),
	num52: p.numeric({ precision: 5, scale: 2 }),
	numS: p.numeric({ precision: 2, scale: 5 }),
	numNeg: p.numeric({ precision: 3, scale: -2 }),
})
