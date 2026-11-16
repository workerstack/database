import { sqliteTable as table, text, integer, real } from "drizzle-orm/sqlite-core"
import { c } from "@lovrozagar/comb/sqlite/columns"
import * as z from "zod"
export const docSchema = z.object({ a: z.string() }).meta({ id: "Doc" })
export const sSchema = z.object({ s: z.string() })
export const listSchema = z.array(z.string())
export const parent = table("parent", { id: c.id("par") })
export const row = table("row", {
	id: c.id("row"),
	parent_id: c.ref("parent_id").references(() => parent.id),
	t_plain: c.text("t_plain"),
	t_req: c.text("t_req").notNull(),
	t_bounds: c.text("t_bounds", { min: 2, max: 5 }).notNull(),
	t_pat: c.text("t_pat", { pattern: "/^[a-z]+$/" }),
	t_pat_dot: c.text("t_pat_dot", { pattern: "/^[^\n\r]{2}$/" }),
	t_pat_p: c.text("t_pat_p", { pattern: "/^\\p{L}+$/" }),
	t_pat_pu: c.text("t_pat_pu", { pattern: "/^\\p{L}+$/u" }),
	t_pat_esc: c.text("t_pat_esc", { pattern: "/^a-b$/" }),
	t_pat_w: c.text("t_pat_w", { pattern: "/^[^x]$/" }),
	t_trim: c.text("t_trim", { trim: true, min: 1, max: 4 }),
	t_low: c.text("t_low", { lowercase: true, pattern: "/^[a-z]+$/" }),
	t_up: c.text("t_up", { uppercase: true, max: 5 }),
	t_trimlow: c.text("t_trimlow", { trim: true, lowercase: true, max: 6 }),
	t_name: c.text("t_name", { name: true, max: 20 }),
	t_email: c.text("t_email", { email: true }).notNull(),
	t_url: c.text("t_url", { url: true }),
	t_img: c.text("t_img", { imageUri: true }),
	t_pw: c.text("t_pw", { password: true }).notNull(),
	t_priv: c.text("t_priv", { private: true }),
	e: c.enum("e", ["a", "b"]).notNull().default("a"),
	e_null: c.enum("e_null", ["x", "y"]),
	i: c.integer("i", { min: 0, max: 10 }),
	i_plain: c.integer("i_plain").notNull(),
	r: c.real("r", { min: 0.5, max: 9.5 }),
	r_plain: c.real("r_plain"),
	ts: c.timestamp("ts"),
	b: c.boolean("b"),
	j: c.json("j", docSchema),
	jb: c.json("jb", sSchema, { maxBytes: 20 }).notNull(),
	ja: c.json("ja", listSchema),
	p_text: text("p_text"),
	p_int: integer("p_int"),
	p_real: real("p_real"),
	p_json: text("p_json", { mode: "json" }),
	p_bool: integer("p_bool", { mode: "boolean" }),
	created_at: c.createdAt("created_at"),
	updated_at: c.updatedAt("updated_at"),
	deleted_at: c.deletedAt("deleted_at"),
})
