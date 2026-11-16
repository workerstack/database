/// <reference types="bun-types" />
/**
 * A2-12 of r22: SQLite's NUMERIC affinity stores a text that reads as a number as an INTEGER or a
 * REAL, keeping 15 significant digits of a REAL, so a plain drizzle `numeric()` column's write DTO
 * takes only a value SQLite keeps as sent, and no spelling SQLite reads otherwise. A taken value
 * may read back in SQLite's spelling (`1.50` as `1.5`), never as another number.
 */
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, numeric, sqliteTable } from "drizzle-orm/sqlite-core";
import * as z from "zod";

import { parseField } from "../../src/codegen/__fixtures__/runtime.ts";
import { generateFieldSchema } from "../../src/codegen/generators/dtos/field-schema.ts";
import { isStorableText } from "../../src/storable-text.ts";

const row = sqliteTable("row", { id: integer("id").primaryKey(), n: numeric("n") });

/** The column's generated write DTO for `type`, evaluated */
function written(type: "create" | "update"): z.ZodType {
  const code = generateFieldSchema(parseField("n", 'numeric("n").notNull()'), type, {
    dialect: "sqlite",
    imports: { enumImports: new Map(), identifiers: new Map(), jsonSchemaImports: new Set() },
  }) as string;

  // the generated file names database's helpers under database's namespace
  return new Function("z", "database", `return ${code}`)(z, { isStorableText }) as z.ZodType;
}

/** A decimal's value as its digits, leading and trailing zeros dropped, and its power of ten */
function valueOf(text: string): string {
  const [, sign, whole, fraction = "", exponent = "0"] = /^(-?)([0-9]*)(?:\.([0-9]*))?(?:e([+-]?[0-9]+))?$/i.exec(
    text,
  ) as RegExpExecArray;

  const digits = `${whole}${fraction}`.replace(/^0+/, "");
  const kept = digits.replace(/0+$/, "");

  if (kept === "") return "0";

  return `${sign}${kept}e${Number(exponent) - fraction.length + (digits.length - kept.length)}`;
}

const POOL = [
  "1",
  "1.5",
  "00001.5",
  "1.50",
  "-0",
  "0.5",
  "123456789012345",
  "123456789012.5",
  "0.1234567890123",
  "0.000000123",
  // CD4 of r23: a fraction past 13 digits, which SQLite 3.53 reads back as another decimal
  "12345678901234.5",
  "0.123456789012345",
  // past 15 digits, which SQLite's REAL, or a driver's JS number, does not keep
  "1234567890123456",
  "0.1234567890123456",
  "9223372036854775808",
  "1".repeat(200),
  // spellings SQLite reads as another value, or as no number
  "1e3",
  " 12 ",
  "+3",
  ".5",
  "0x10",
  "abc",
  "",
];

describe("a SQLite numeric column's write DTO, by what SQLite stores (A2-12)", () => {
  for (const type of ["create", "update"] as const) {
    it(`${type} takes only a value SQLite keeps, refusing more than 15 digits, a fraction of more than 13 and any other spelling`, () => {
      const schema = written(type);
      const client = new Database(":memory:");
      client.run("CREATE TABLE row (id INTEGER PRIMARY KEY, n NUMERIC NOT NULL)");
      const db = drizzle({ client });

      const taken = POOL.filter((value, id) => {
        if (!schema.safeParse(value).success) return false;
        db.insert(row).values({ id, n: value }).run();

        const stored = db
          .select()
          .from(row)
          .all()
          .find((each) => each.id === id)?.n as string;

        expect(valueOf(stored), `${value} read back as ${stored}`).toBe(valueOf(value));

        return true;
      });

      expect(taken).toEqual(POOL.slice(0, 10));
    });
  }
});

// CD4 of r23: drizzle reads a numeric as `cast(n as text)`, and SQLite 3.53 writes a REAL whose 15
// digits it does not read back as itself with 17, so 57.2505567882849 read back as 57.250556788284897.
// A fraction of at most 13 significant digits reads back as sent; 14 and 15 did not
describe("a SQLite numeric fraction reads back as sent (CD4)", () => {
  let seed = 11;
  const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

  /** A decimal of `digits` significant digits, its point anywhere in them or before them */
  const decimal = (digits: number): string => {
    const text = Array.from({ length: digits }, (_, at) =>
      String(at === 0 ? 1 + Math.floor(random() * 9) : Math.floor(random() * 10)),
    ).join("");

    const point = Math.floor(random() * digits);

    return point === 0 ? `0.${text}` : `${text.slice(0, point)}.${text.slice(point)}`;
  };

  it("takes a fraction of at most 13 digits, reads each back as its value, and refuses 14 or 15", () => {
    const schema = written("create");
    const client = new Database(":memory:");
    client.run("CREATE TABLE row (id INTEGER PRIMARY KEY, n NUMERIC NOT NULL)");
    const db = drizzle({ client });
    let id = 0;

    for (const digits of [12, 13, 14, 15]) {
      for (let each = 0; each < 2000; each++) {
        const value = decimal(digits);
        const taken = schema.safeParse(value).success;
        expect(taken, value).toBe(digits <= 13);

        if (!taken) continue;
        const [stored] = db.insert(row).values({ id: ++id, n: value }).returning({ n: row.n }).all();
        expect(valueOf(stored?.n as string), `${value} read back as ${stored?.n}`).toBe(valueOf(value));
      }
    }
  });
});
