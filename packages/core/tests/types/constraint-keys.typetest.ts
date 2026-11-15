/**
 * The format and schema keys each c helper takes, on both dialects; src/codegen/annotations.test.ts
 * holds each helper's key set to its constraint type (CD9 of r22b). Checked by `bun run typecheck`;
 * nothing here runs.
 */
import { expectTypeOf } from "vitest";
import * as z from "zod";

import type { IntegerFormat, TextFormat } from "../../src/formats/catalog.ts";
import { c as pg } from "../../src/pg/columns.ts";
import { c } from "../../src/sqlite/columns.ts";
import type { EnumOptions, IntegerConstraints, RefConstraints, TextConstraints } from "../../src/sqlite/constraints.ts";

// Plan 24: `format` takes the catalog's ids on c.text, c.enum and c.integer alone, and `schema` a zod
// schema of the column's own value on c.text, c.integer and c.real alone, on both dialects. Each
// refused call sits beside one that differs only in what it is refused for.
const even = z.int().refine((value) => value % 2 === 0, { error: "Must be even" });

for (const h of [c, pg]) {
  h.text("currency", { format: "iso4217" });
  // @ts-expect-error a format id database's catalog does not hold
  h.text("currency", { format: "iso-4217" });
  h.enum("pay", ["USD", "EUR"], { format: "iso4217" });
  // @ts-expect-error a format id database's catalog does not hold
  h.enum("pay", ["USD", "EUR"], { format: "iso-4217" });
  h.integer("week_start", { format: "iso8601-weekday" });
  // @ts-expect-error an integer format takes no text format's id
  h.integer("week_start", { format: "iso4217" });
  // @ts-expect-error c.real takes no format
  h.real("ratio", { format: "iso8601-weekday" });
  // @ts-expect-error c.ref takes no format: its value is another table's key
  h.ref("owner_id", { format: "ulid" });

  h.text("date_order", { schema: z.enum(["iso", "dmy", "mdy"]) });
  // @ts-expect-error a text's schema takes a string
  h.text("date_order", { schema: z.int() });
  // @ts-expect-error a text's schema yields a string
  h.text("date_order", { schema: z.string().transform(Number) });
  h.integer("slot_minutes", { min: 0, schema: even });
  // @ts-expect-error a number's schema takes a number
  h.integer("slot_minutes", { schema: z.string() });
  h.real("ratio", { schema: z.number().min(0) });
  // @ts-expect-error a number's schema takes a number
  h.real("ratio", { schema: z.string() });
  // @ts-expect-error a timestamp takes no schema
  h.timestamp("at", { schema: z.number() });
  // @ts-expect-error a timestamp takes no schema
  h.createdAt("created_at", { schema: z.number() });
  // @ts-expect-error c.ref takes no schema: its value is another table's key
  h.ref("owner_id", { schema: z.string() });
  // @ts-expect-error c.enum takes no schema: its values are its rule
  h.enum("status", ["a", "b"], { schema: z.enum(["a", "b"]) });
}

expectTypeOf<NonNullable<TextConstraints["format"]>>().toEqualTypeOf<TextFormat>();

expectTypeOf<NonNullable<EnumOptions["format"]>>().toEqualTypeOf<TextFormat>();

expectTypeOf<NonNullable<IntegerConstraints["format"]>>().toEqualTypeOf<IntegerFormat>();

expectTypeOf<keyof RefConstraints>().toEqualTypeOf<Exclude<keyof TextConstraints, "format" | "schema">>();
