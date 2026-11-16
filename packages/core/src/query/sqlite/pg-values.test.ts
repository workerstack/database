import { sql } from "drizzle-orm";
import { PgDialect, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { IsoInstant } from "../iso-date.ts";
import { pgCompared, pgContainsSQL, pgInstant } from "./pg-values.ts";

const pg = new PgDialect();
const item = pgTable("item", { i: integer("i"), tags: jsonb("tags"), title: text("title") });
const query = (value: unknown) => pg.sqlToQuery(sql`${item.i} = ${value}`);

describe("pgInstant", () => {
  it("writes an instant as ISO text to the microsecond, a number or Date as its ISO text, and keeps any other value", () => {
    expect(pgInstant(new IsoInstant(Date.UTC(2024, 0, 1) + 999, "999499999"))).toBe("2024-01-01T00:00:00.999499Z");
    expect(pgInstant(Date.UTC(2024, 0, 1))).toBe("2024-01-01T00:00:00.000Z");
    expect(pgInstant(new Date(Date.UTC(2024, 0, 1)))).toBe("2024-01-01T00:00:00.000Z");
    expect(pgInstant("notnull")).toBe("notnull");
  });
});

describe("pgCompared", () => {
  it("binds a number as numeric, alone or in a list, and keeps a value of another type", () => {
    expect(query(pgCompared("number", { operator: "eq", value: 1.5 })).sql).toBe('"item"."i" = $1::numeric');
    const list = pgCompared("numeric", { operator: "in", value: [1, "x"] }) as unknown[];
    expect(list[1]).toBe("x");
    expect(query(list[0]).sql).toBe('"item"."i" = $1::numeric');
  });

  it("binds a date's text as it is, and leaves a value an operator does not compare, or a column of no such kind", () => {
    expect(query(pgCompared("date-ms", { operator: "lt", value: "2024-01-01T00:00:00Z" })).params).toEqual([
      "2024-01-01T00:00:00Z",
    ]);
    expect(pgCompared("date-ms", { operator: "is", value: "notnull" })).toBe("notnull");
    expect(pgCompared("text", { operator: "eq", value: "a" })).toBe("a");
  });
});

describe("pgContainsSQL", () => {
  it("reads a member of a json or jsonb column's array, typed as the value is, and nothing of any other column", () => {
    for (const [value, cast] of [
      [2, "numeric"],
      [true, "boolean"],
      ["red", "text"],
    ] as const)
      expect(pg.sqlToQuery(pgContainsSQL(item.tags, value) ?? sql``).sql).toContain(`jsonb_build_array($1::${cast})`);
    expect(pgContainsSQL(item.title, "red")).toBeUndefined();
    expect(pgContainsSQL(sql`x`, "red")).toBeUndefined();
  });
});
