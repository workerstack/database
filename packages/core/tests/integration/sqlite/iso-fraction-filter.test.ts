/**
 * QL3 of r23: an ISO date filter cut a fraction past milliseconds, so `lt .9995Z` read as `lt .999Z`
 * and missed the row at .999, and `gte`, `eq` and `ne` were each wrong the other way. Each operator
 * now answers the exact comparison, on a millisecond, a seconds and an ISO text column, against an
 * oracle computed in nanoseconds here.
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { validateFilter } from "../../../src/query/filter-validate.ts";
import { filterToSQL } from "../../../src/query/sqlite/executor.ts";
import type { FilterAST } from "../../../src/query/types.ts";
import { libsqlMemory } from "../support/libsql.ts";

const ev = sqliteTable("ev", {
  id: text("id").primaryKey(),
  iso: text("iso"),
  ms: integer("ms", { mode: "timestamp_ms" }),
  s: integer("s", { mode: "timestamp" }),
});

const OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte"] as const;

type Operator = (typeof OPERATORS)[number];

const EXACT: Record<Operator, (row: bigint, bound: bigint) => boolean> = {
  eq: (row, bound) => row === bound,
  gt: (row, bound) => row > bound,
  gte: (row, bound) => row >= bound,
  lt: (row, bound) => row < bound,
  lte: (row, bound) => row <= bound,
  ne: (row, bound) => row !== bound,
};

const BASE = Date.UTC(2024, 0, 1);

// rows a second apart in s, a millisecond apart in ms and iso, around the bounds below
const ROWS = [-2, -1, 0, 1, 2].map((step, i) => ({ id: `r${i}`, ms: BASE + 999 + step, s: BASE / 1000 + step }));

/** The nanoseconds of `ms` epoch milliseconds */
const nanosOf = (ms: number): bigint => BigInt(ms) * 1_000_000n;

/** A bound `fraction` digits past second `second` of BASE, as ISO text and in nanoseconds */
function boundAt(second: number, fraction: string): { iso: string; nanos: bigint } {
  const at = new Date(BASE + second * 1000).toISOString().slice(0, 19);

  return { iso: `${at}.${fraction}Z`, nanos: nanosOf(BASE + second * 1000) + BigInt(fraction.padEnd(9, "0")) };
}

/** The AST of `filter`, which `fields` must take */
function astOf(filter: string, fields: Parameters<typeof validateFilter>[1]): FilterAST {
  const result = validateFilter(filter, fields);

  if (result === null || !result.valid) throw new Error(`${filter}: ${result?.errors.join("; ") ?? "empty"}`);

  return result.ast;
}

// each bound a fraction finer than milliseconds, between rows and on one
const BOUNDS = [
  boundAt(0, "9995"),
  boundAt(0, "9985"),
  boundAt(0, "998000001"),
  boundAt(0, "999000000"),
  boundAt(0, "0005"),
  boundAt(1, "0005"),
  boundAt(-1, "9999999"),
  boundAt(2, "000000001"),
];

type Harness = ReturnType<typeof libsqlMemory>;

/** A memory database holding ROWS in ev */
async function seeded(): Promise<Harness> {
  const harness = libsqlMemory();
  await harness.client.execute("CREATE TABLE ev (id TEXT PRIMARY KEY, iso TEXT, ms INTEGER, s INTEGER)");

  for (const row of ROWS) {
    await harness.client.execute({
      args: [row.id, new Date(row.ms).toISOString(), row.ms, row.s],
      sql: "INSERT INTO ev VALUES (?, ?, ?, ?)",
    });
  }

  return harness;
}

/** The ids of ev's rows `filter` serves, which `fields` must take, in id order */
async function idsOf(
  harness: Harness,
  filter: string,
  fields: Parameters<typeof validateFilter>[1],
): Promise<string[]> {
  const where = filterToSQL(astOf(filter, fields), { mainTable: ev });

  const rows = await harness.db
    .select({ id: ev.id })
    .from(ev)
    .where(where ?? undefined)
    .orderBy(ev.id);

  return rows.map((row) => row.id);
}

/** The nanoseconds each column of ev stores of a row */
const STORED = {
  iso: (row: (typeof ROWS)[number]) => nanosOf(row.ms),
  ms: (row: (typeof ROWS)[number]) => nanosOf(row.ms),
  s: (row: (typeof ROWS)[number]) => nanosOf(row.s * 1000),
};

describe("an ISO date filter past milliseconds is the exact comparison (QL3)", () => {
  it("on a millisecond, a seconds and an ISO text column, for every operator", async () => {
    const harness = await seeded();

    try {
      for (const column of ["ms", "s", "iso"] as const) {
        for (const { iso, nanos } of BOUNDS) {
          for (const operator of OPERATORS) {
            const filter = `${column}.${operator}.${iso}`;
            const spec = { [column]: { format: "iso", operators: [...OPERATORS], type: "date" } } as const;
            const want = ROWS.filter((row) => EXACT[operator](STORED[column](row), nanos)).map((row) => row.id);
            expect(await idsOf(harness, filter, spec), filter).toEqual(want);
          }
        }
      }
    } finally {
      harness.close();
    }
  });

  it("in and nin take a member past milliseconds as matching no row", async () => {
    const harness = await seeded();

    try {
      await harness.client.execute("INSERT INTO ev VALUES ('null', NULL, NULL, NULL)");
      const exact = new Date(ROWS[2]?.ms as number).toISOString();

      const cases: Array<[string, string[]]> = [
        [`ms.in.(${exact},2024-01-01T00:00:00.9995Z)`, ["r2"]],
        ["ms.in.(2024-01-01T00:00:00.9995Z)", []],
        [`ms.nin.(${exact},2024-01-01T00:00:00.9995Z)`, ["r0", "r1", "r3", "r4"]],
        ["ms.nin.(2024-01-01T00:00:00.9995Z)", ["r0", "r1", "r2", "r3", "r4"]],
        ["iso.nin.(2024-01-01T00:00:00.9995Z)", ["r0", "r1", "r2", "r3", "r4"]],
      ];

      for (const [filter, want] of cases) {
        const column = filter.slice(0, filter.indexOf("."));
        const spec = { [column]: { format: "iso", operators: ["in", "nin"], type: "date" } } as const;
        expect(await idsOf(harness, filter, spec), filter).toEqual(want);
      }
    } finally {
      harness.close();
    }
  });
});

describe("contains of an ISO instant past milliseconds (QL3)", () => {
  it("contains takes a member past milliseconds as matching no row", async () => {
    const tagged = sqliteTable("tagged", { at: text("at"), id: text("id").primaryKey() });
    const harness = libsqlMemory();

    try {
      await harness.client.execute("CREATE TABLE tagged (id TEXT PRIMARY KEY, at TEXT)");
      await harness.client.execute(`INSERT INTO tagged VALUES ('t', '["2024-01-01T00:00:00.999Z"]')`);
      const spec = { at: { format: "iso" as const, operators: ["contains" as const], type: "date" as const } };

      const ids = async (filter: string): Promise<string[]> => {
        const where = filterToSQL(astOf(filter, spec), { mainTable: tagged });

        return (
          await harness.db
            .select({ id: tagged.id })
            .from(tagged)
            .where(where ?? undefined)
        ).map((row) => row.id);
      };

      expect(await ids("at.contains.2024-01-01T00:00:00.999Z")).toEqual(["t"]);
      expect(await ids("at.contains.2024-01-01T00:00:00.9995Z")).toEqual([]);
    } finally {
      harness.close();
    }
  });
});
