/**
 * The operator class Postgres 17 gives an index element that spells none, for each built-in type
 * and access method: an index is made over a column of each type by each method on a scratch
 * database, and the class it took (none where Postgres refuses it, as no default exists) must equal
 * the one database resolves a left-out class to when it matches a partition's index to its parent's.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";

import { defaultClass } from "../../../src/migrate/core/pg-opclass.ts";
import { withScratchDb } from "../support/pg.ts";

const METHODS = ["brin", "btree", "gin", "gist", "hash", "spgist"];

// every built-in type a column can take that has an array type, which leaves out the pseudo-types
const TYPES = `SELECT typname FROM pg_type WHERE typnamespace = 'pg_catalog'::regnamespace
  AND typtype IN ('b', 'r', 'm') AND typarray <> 0 AND typname NOT LIKE 'pg\\_%' ORDER BY typname`;

const CLASS = `SELECT c.opcname FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_opclass c ON c.oid = x.indclass[0] WHERE i.relname = $1`;

/** The class Postgres gives an index of `method` over a column of `type` (`int4[]` for an array), undefined where it makes none */
async function given(client: pg.Client, type: string, method: string): Promise<string | undefined> {
  await client.query("SAVEPOINT s");

  try {
    await client.query(`CREATE TABLE probe (a ${type})`);
    await client.query(`CREATE INDEX probed ON probe USING ${method} (a)`);
    const { rows } = await client.query<{ opcname: string }>(CLASS, ["probed"]);

    return rows[0]?.opcname;
  } catch {
    return undefined;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT s");
  }
}

describe("the operator class an element that spells none takes", () => {
  it("is Postgres 17's for every built-in type, an array and each access method", async () => {
    const result = await withScratchDb(async (url) => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();

      try {
        await client.query("BEGIN");
        const types = (await client.query<{ typname: string }>(TYPES)).rows.map((row) => row.typname);
        const found: Record<string, string | undefined> = {};
        const ours: Record<string, string | undefined> = {};

        for (const type of [...types, "int4[]"]) {
          for (const method of METHODS) {
            const label = `${method} ${type}`;
            found[label] = await given(client, `"${type.replace("[]", "")}"${type.endsWith("[]") ? "[]" : ""}`, method);

            const column = {
              collation: undefined,
              dims: type.endsWith("[]") ? 1 : 0,
              mods: [],
              type: type.replace("[]", ""),
            };

            ours[label] = defaultClass(method, column);
          }
        }

        return { found, ours };
      } finally {
        await client.end();
      }
    });

    expect(Object.values(result.found).filter(Boolean).length).toBeGreaterThan(100);
    expect(result.ours).toEqual(result.found);
  });
});
