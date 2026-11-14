/**
 * CD9 of r22b: the keys codegen lets each c helper take are the keys of the constraint type that
 * helper's own signature takes, on both dialects, so neither the sets nor the types drift: a key
 * added to a type and not to its set would be refused at codegen, and one in a set its type lacks
 * would be taken from a JavaScript caller alone. Checked by `bun run typecheck`; nothing here runs.
 */
import { expectTypeOf } from "vitest"
import * as z from "zod"
import type { ConstraintKeys } from "../../src/codegen/annotations.ts"
import type { IntegerFormat, TextFormat } from "../../src/formats/catalog.ts"
import { c as pg, type PgColumns } from "../../src/pg/columns.ts"
import type {
	EnumOptions,
	EnumStates,
	IntegerConstraints,
	RefConstraints,
	TextConstraints,
} from "../../src/sqlite/constraints.ts"
import { c, type SqliteColumns } from "../../src/sqlite/columns.ts"

type Columns = PgColumns | SqliteColumns

/** The record a helper is given: its last parameter, after a c.json's schema or a c.enum's values; none for c.serialId */
type Given<K extends keyof SqliteColumns> = K extends "enum" | "json"
	? Parameters<Columns[K]>[2]
	: Parameters<Columns[K]> extends [unknown, (infer C)?]
		? C
		: Record<never, never>

/** The keys that record names: c.enum's flags beside its state machine */
type Taken<K extends keyof SqliteColumns> = K extends "enum"
	? Exclude<keyof NonNullable<Given<K>>, keyof EnumStates>
	: keyof NonNullable<Given<K>>

type Set<K extends keyof ConstraintKeys> = ConstraintKeys[K][number]

expectTypeOf<Set<"boolean">>().toEqualTypeOf<Taken<"boolean">>()
expectTypeOf<Set<"createdAt">>().toEqualTypeOf<Taken<"createdAt">>()
expectTypeOf<Set<"deletedAt">>().toEqualTypeOf<Taken<"deletedAt">>()
expectTypeOf<Set<"enum">>().toEqualTypeOf<Taken<"enum">>()
expectTypeOf<Set<"id">>().toEqualTypeOf<Taken<"id">>()
expectTypeOf<Set<"integer">>().toEqualTypeOf<Taken<"integer">>()
expectTypeOf<Set<"json">>().toEqualTypeOf<Taken<"json">>()
expectTypeOf<Set<"real">>().toEqualTypeOf<Taken<"real">>()
expectTypeOf<Set<"ref">>().toEqualTypeOf<Taken<"ref">>()
expectTypeOf<Set<"serialId">>().toEqualTypeOf<Taken<"serialId">>()
expectTypeOf<Set<"text">>().toEqualTypeOf<Taken<"text">>()
expectTypeOf<Set<"timestamp">>().toEqualTypeOf<Taken<"timestamp">>()
expectTypeOf<Set<"updatedAt">>().toEqualTypeOf<Taken<"updatedAt">>()
/* every helper is held: a helper added to c without a set fails here */
expectTypeOf<keyof ConstraintKeys>().toEqualTypeOf<keyof SqliteColumns>()
expectTypeOf<keyof PgColumns>().toEqualTypeOf<keyof SqliteColumns>()

/*
 * Plan 24: `format` takes the catalog's ids on c.text, c.enum and c.integer alone, and `schema` a zod
 * schema of the column's own value on c.text, c.integer and c.real alone, on both dialects. Each
 * refused call sits beside one that differs only in what it is refused for.
 */
const even = z.int().refine((value) => value % 2 === 0, { error: "Must be even" })
for (const h of [c, pg]) {
	h.text("currency", { format: "iso4217" })
	// @ts-expect-error a format id database's catalog does not hold
	h.text("currency", { format: "iso-4217" })
	h.enum("pay", ["USD", "EUR"], { format: "iso4217" })
	// @ts-expect-error a format id database's catalog does not hold
	h.enum("pay", ["USD", "EUR"], { format: "iso-4217" })
	h.integer("week_start", { format: "iso8601-weekday" })
	// @ts-expect-error an integer format takes no text format's id
	h.integer("week_start", { format: "iso4217" })
	// @ts-expect-error c.real takes no format
	h.real("ratio", { format: "iso8601-weekday" })
	// @ts-expect-error c.ref takes no format: its value is another table's key
	h.ref("owner_id", { format: "ulid" })

	h.text("date_order", { schema: z.enum(["iso", "dmy", "mdy"]) })
	// @ts-expect-error a text's schema takes a string
	h.text("date_order", { schema: z.int() })
	// @ts-expect-error a text's schema yields a string
	h.text("date_order", { schema: z.string().transform(Number) })
	h.integer("slot_minutes", { min: 0, schema: even })
	// @ts-expect-error a number's schema takes a number
	h.integer("slot_minutes", { schema: z.string() })
	h.real("ratio", { schema: z.number().min(0) })
	// @ts-expect-error a number's schema takes a number
	h.real("ratio", { schema: z.string() })
	// @ts-expect-error a timestamp takes no schema
	h.timestamp("at", { schema: z.number() })
	// @ts-expect-error a timestamp takes no schema
	h.createdAt("created_at", { schema: z.number() })
	// @ts-expect-error c.ref takes no schema: its value is another table's key
	h.ref("owner_id", { schema: z.string() })
	// @ts-expect-error c.enum takes no schema: its values are its rule
	h.enum("status", ["a", "b"], { schema: z.enum(["a", "b"]) })
}

expectTypeOf<NonNullable<TextConstraints["format"]>>().toEqualTypeOf<TextFormat>()
expectTypeOf<NonNullable<EnumOptions["format"]>>().toEqualTypeOf<TextFormat>()
expectTypeOf<NonNullable<IntegerConstraints["format"]>>().toEqualTypeOf<IntegerFormat>()
expectTypeOf<keyof RefConstraints>().toEqualTypeOf<Exclude<keyof TextConstraints, "format" | "schema">>()
