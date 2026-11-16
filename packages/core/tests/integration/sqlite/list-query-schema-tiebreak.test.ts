/**
 * CS1 of r23: a list schema's `tiebreak` is the column the list publishes as `stableTiebreak`, and
 * buildListQuery and listOptions broke ties on `id` whatever it named. A client that walks the list
 * by the published tiebreak saw rows out of its order. Each builder breaks ties on the schema's
 * column, and a table without it is refused, naming it.
 */
import { getTableColumns, type SQL, sql } from "drizzle-orm";
import { integer, SQLiteDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { SEALED } from "../../../src/query/__fixtures__/cursor-secret.ts";
import { queryHelpers } from "../../../src/query/drizzle.ts";
import { createListQuerySchema } from "../../../src/query/list-schema.ts";
import { buildListQuery } from "../../../src/query/sqlite/build-list-query.ts";
import { libsqlMemory } from "../support/libsql.ts";

const post = sqliteTable("post", { id: integer("id").primaryKey(), rank: integer("rank"), slug: text("slug") });

// every rank ties, and slug order is not id order
const POSTS: Array<[number, number, string]> = [
  [1, 0, "s4"],
  [2, 0, "s5"],
  [3, 0, "s1"],
  [4, 0, "s3"],
  [5, 0, "s2"],
];

const dialect = new (SQLiteDialect as unknown as new () => { sqlToQuery: (sql: SQL) => { sql: string } })();

const schema = createListQuerySchema({ sort: ["rank", "slug"], tiebreak: "slug" });

describe("a list schema's tiebreak other than id (CS1)", () => {
  it("is the one the schema publishes", () => {
    expect(schema.parse({ limit: "2", order: "rank.asc" }).tiebreak).toBe("slug");
  });

  it("buildListQuery pages by it, every row once, in its order", async () => {
    const harness = libsqlMemory();

    try {
      await harness.client.execute("CREATE TABLE post (id INTEGER PRIMARY KEY, rank INTEGER, slug TEXT)");

      for (const args of POSTS) await harness.client.execute({ args, sql: "INSERT INTO post VALUES (?, ?, ?)" });
      const seen: string[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 6; page++) {
        const parsed = schema.parse({ cursor, limit: "2", order: "rank.asc" });
        const built = buildListQuery({ ...SEALED, parsed, table: post });
        const query = harness.db.select({ rank: post.rank, slug: post.slug, ...built.extras }).from(post);

        const rows = await (built.where === undefined ? query : query.where(built.where))
          .orderBy(...built.orderBy)
          .limit(built.limit)
          .offset(built.offset);

        const [items, meta] = queryHelpers.paginate(rows, built);
        seen.push(...items.map((row) => row.slug as string));

        if (meta.nextCursor === null) break;
        cursor = meta.nextCursor;
      }

      expect(seen).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    } finally {
      harness.close();
    }
  });

  it("listOptions orders by it after the sort", () => {
    const options = queryHelpers.listOptions(schema.parse({ limit: "2", order: "rank.asc" }), SEALED);
    const { sql: orderBy } = dialect.sqlToQuery(sql.join(options.orderBy(getTableColumns(post)), sql`, `));
    expect(orderBy).toBe('"post"."rank" ASC NULLS LAST, "post"."slug" ASC NULLS LAST');
  });

  it("each builder refuses a table without it where it needs one, naming it", () => {
    const bare = sqliteTable("bare", { id: integer("id").primaryKey() });
    const parsed = schema.parse({ limit: "2", order: "rank.asc" });
    expect(() =>
      buildListQuery({ ...SEALED, parsed: { ...parsed, cursor: "c", parsedSort: [] }, table: bare }),
    ).toThrow(expect.objectContaining({ cause: expect.stringContaining('"slug"') }));
    const options = queryHelpers.listOptions({ ...parsed, parsedSort: [] }, SEALED);
    expect(() => options.orderBy(getTableColumns(bare))).toThrow(
      expect.objectContaining({ cause: expect.stringContaining("`slug`") }),
    );
  });
});
