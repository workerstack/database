/**
 * The scope reader follows a Postgres file's own BEGIN: a txmode none file commits each statement
 * outside it, and the locks a NOT VALID ADD took end with that commit (PA8 of r22b), while a file
 * Atlas runs in one transaction holds them to its end.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { type Held, heldStart } from "./pg-held.ts";
import { historyFacts } from "./pg-history.ts";
import { loadPostgresParser } from "./pg-parser.ts";
import { scopeReader } from "./pg-scope.ts";
import { pgRead } from "./pg-split.ts";
import { extractSchema } from "./schema.ts";

beforeAll(loadPostgresParser);

/** The tables still held after each statement of `sql`, read as a file outside a transaction when `bare` */
function heldAfter(sql: string, bare: boolean): string[][] {
  const held: Held = heldStart();
  const read = scopeReader(bare, { facts: historyFacts(undefined, "public"), held });

  return pgRead(sql).statements.map(({ tree }, i) => {
    read(tree);
    held.locks.set(`t${i}`, false);

    return [...held.locks.keys()];
  });
}

const SQL = "SELECT 1;\nBEGIN;\nSELECT 2;\nSELECT 3;\nCOMMIT;\nSELECT 4;\n";

describe("scopeReader: the locks a file holds, by where its statements commit (PA8; sibling: one transaction)", () => {
  it("lets go of them at each statement a txmode none file commits, and holds them inside its own BEGIN", () => {
    expect(heldAfter(SQL, true)).toEqual([
      ["t0"],
      ["t1"],
      ["t1", "t2"],
      ["t1", "t2", "t3"],
      ["t1", "t2", "t3", "t4"],
      ["t5"],
    ]);
  });

  it("holds them to the end of a file Atlas runs in one transaction", () => {
    expect(heldAfter(SQL, false).at(-1)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5"]);
  });

  it("reads a statement Postgres runs only outside a transaction, and one it runs only inside a block", () => {
    const read = scopeReader(true, { facts: historyFacts(undefined, "public"), held: heldStart() });
    const [vacuum, savepoint] = pgRead("VACUUM t;\nSAVEPOINT s;\n").statements.map(({ tree }) => read(tree));
    expect({ savepoint: savepoint?.inside !== undefined, vacuum: vacuum?.outside !== undefined }).toEqual({
      savepoint: true,
      vacuum: true,
    });
  });
});

// PA7 of r23: clones cut to one name on LIST partitions of text, which database cannot order, one partitioned and one not
const X = "x".repeat(58);

const TEXT_PARTITIONS = [
  "CREATE TABLE r (a text) PARTITION BY LIST (a);",
  `CREATE TABLE ${X}_1 PARTITION OF r FOR VALUES IN ('b') PARTITION BY LIST (a);`,
  `CREATE TABLE ${X}_2 PARTITION OF r FOR VALUES IN ('a');`,
  "CREATE INDEX ON r (a);",
].join("\n");

const CUT = `${"x".repeat(57)}_a_idx`;

/** What the scope reader refuses of each statement of `sql` after the history `history`, read as `bare` and `replays` say */
function refusedAfter(history: string, sql: string, { bare = false, replays = false } = {}): Array<string | undefined> {
  const facts = historyFacts(extractSchema(history, undefined, "postgres"), "public");
  const read = scopeReader(bare, { facts, held: heldStart() }, replays);

  return pgRead(sql).statements.map(({ tree }) => read(tree).refused);
}

describe("scopeReader: a REINDEX INDEX of a name database cannot place (PA7 of r23)", () => {
  it("refuses it in a transaction, for each name the clones may have swapped", () => {
    const refused = refusedAfter(TEXT_PARTITIONS, `REINDEX INDEX ${CUT};\nREINDEX INDEX ${CUT}1;\n`);

    for (const each of refused) expect(each).toContain("database cannot tell whether Postgres gave");
    expect(refused[0]).toContain("put the statement in its own -- atlas:txmode none file");
  });

  it("refuses it inside a txmode none file's own BEGIN", () => {
    const refused = refusedAfter(TEXT_PARTITIONS, `BEGIN;\nREINDEX INDEX ${CUT};\nCOMMIT;\n`, { bare: true });
    expect(refused[1]).toContain("database cannot tell");
  });

  it("leaves it to Postgres outside a transaction, under a replay, of the partitioned table's own index, and by REINDEX TABLE (siblings)", () => {
    expect(refusedAfter(TEXT_PARTITIONS, `REINDEX INDEX ${CUT};\n`, { bare: true })).toEqual([undefined]);
    expect(refusedAfter(TEXT_PARTITIONS, `REINDEX INDEX ${CUT};\n`, { replays: true })).toEqual([undefined]);
    expect(refusedAfter(TEXT_PARTITIONS, `REINDEX INDEX r_a_idx;\nREINDEX TABLE ${X}_2;\n`)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("leaves it alone where the clones' order is sure, or where both partitions are plain (siblings)", () => {
    const ordered = TEXT_PARTITIONS.replace("(a text)", "(a int)").replace("('b')", "(2)").replace("('a')", "(1)");
    const plain = TEXT_PARTITIONS.replace("('b') PARTITION BY LIST (a);", "('b');");
    expect(refusedAfter(ordered, `REINDEX INDEX ${CUT};\nREINDEX INDEX ${CUT}1;\n`)).toEqual([undefined, undefined]);
    expect(refusedAfter(plain, `REINDEX INDEX ${CUT};\nREINDEX INDEX ${CUT}1;\n`)).toEqual([undefined, undefined]);
  });
});
