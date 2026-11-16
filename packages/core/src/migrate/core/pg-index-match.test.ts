/**
 * Where database cannot tell whether a partition's index matches its parent's (cases 3a-3c of plan
 * 31's facts probe): the clone it makes in that index's place is marked unsure, with every clone
 * under it, and a REINDEX INDEX naming one is refused without a replay. The matches it can resolve
 * are held to Postgres 17 by MATCH_CASES (tests/support/pg-index-cases-match.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { heldStart } from "./pg-held.ts";
import { historyFacts } from "./pg-history.ts";
import { loadPostgresParser } from "./pg-parser.ts";
import { scopeReader } from "./pg-scope.ts";
import { pgRead } from "./pg-split.ts";
import { extractSchema } from "./schema.ts";

beforeAll(loadPostgresParser);

const facts = (sql: string) => historyFacts(extractSchema(sql, undefined, "postgres"), "public");

/** Each index of the history `sql` that database marks unsure, with why */
const unsure = (sql: string) =>
  Object.fromEntries([...facts(sql).indexes].flatMap(([key, index]) => (index.unsure ? [[key, index.unsure]] : [])));

/** A partitioned p and a table c attached to it, `index` on c made before `parent` on p */
const attached = (type: string, index: string, parent: string) =>
  `CREATE TABLE p (a ${type}) PARTITION BY RANGE (a);\nCREATE TABLE c (a ${type});\n` +
  `CREATE INDEX ON c (${index});\nCREATE INDEX ON p (${parent});\nALTER TABLE p ATTACH PARTITION c DEFAULT;`;

const EXPRESSION = attached("text", 'lower(a) COLLATE "C"', "lower(a)");
const EXTENSION = `CREATE EXTENSION citext;\n${attached("citext", "a citext_ops", "a")}`;

/** What the scope reader refuses of each statement of `sql` after `history`, read as `bare` and `replays` say */
function refusedAfter(history: string, sql: string, { bare = false, replays = false } = {}) {
  const read = scopeReader(bare, { facts: facts(history), held: heldStart() }, replays);

  return pgRead(sql).statements.map(({ tree }) => read(tree).refused);
}

describe("a partition's index database cannot match to its parent's", () => {
  it("marks the clone it makes unsure where an expression's collation is spelled on one side", () => {
    expect(unsure(EXPRESSION)).toEqual({ c_lower_idx1: "match" });
  });

  it("marks it where one side spells a class of a type database knows no default for", () => {
    expect(unsure(EXTENSION)).toEqual({ c_a_idx1: "match" });
  });

  it("marks each clone under it on a partitioned partition", () => {
    const sub =
      "CREATE TABLE p (a text) PARTITION BY RANGE (a);\nCREATE TABLE c (a text) PARTITION BY RANGE (a);\n" +
      'CREATE TABLE c1 PARTITION OF c DEFAULT;\nCREATE INDEX ON c (lower(a) COLLATE "C");\n' +
      "CREATE INDEX ON p (lower(a));\nALTER TABLE p ATTACH PARTITION c DEFAULT;";

    expect(unsure(sub)).toEqual({ c1_lower_idx1: "match", c_lower_idx1: "match" });
  });

  it("attaches to a later index that matches, past one it cannot tell, and marks none (sibling: classes spelled apart)", () => {
    const later = EXPRESSION.replace("CREATE INDEX ON p", "CREATE INDEX ON c (lower(a));\nCREATE INDEX ON p");
    expect([...facts(later).indexes.keys()].toSorted()).toEqual(["c_lower_idx", "c_lower_idx1", "p_lower_idx"]);
    expect(unsure(later)).toEqual({});
    expect(unsure(attached("text", "a text_pattern_ops", "a"))).toEqual({});
  });

  it("refuses a REINDEX INDEX of the clone in a file or a transaction, and leaves it to a replay", () => {
    const reindex = "REINDEX INDEX c_lower_idx1;\n";

    for (const bare of [false, true]) {
      expect(refusedAfter(EXPRESSION, reindex, { bare })).toEqual([
        expect.stringContaining("database cannot tell whether Postgres made c_lower_idx1"),
      ]);
    }

    expect(refusedAfter(EXPRESSION, reindex, { replays: true })).toEqual([undefined]);
    expect(refusedAfter(EXPRESSION, "REINDEX INDEX c_lower_idx;\n")).toEqual([undefined]);
  });
});
