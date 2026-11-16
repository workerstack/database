/**
 * What a DROP COLUMN, a NO INHERIT and a column rename leave of a history's facts down inheritance.
 * The indexes each leaves are held to Postgres 17 by INHERIT_CASES (tests/support/pg-index-cases-inherit.ts);
 * these read the columns each table keeps and the keys that go with a dropped column.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { historyFacts } from "./pg-history.ts";
import { descendants, droppedFrom } from "./pg-inherit.ts";
import { emptyFacts } from "./pg-nodes.ts";
import { loadPostgresParser } from "./pg-parser.ts";
import { extractSchema } from "./schema.ts";

beforeAll(loadPostgresParser);

const facts = (sql: string) => historyFacts(extractSchema(sql, undefined, "postgres"), "public");
const PAR = "CREATE TABLE par (a int, b int);\n";
const CH = `${PAR}CREATE TABLE ch () INHERITS (par);\n`;

/** The facts of a child of par keyed on b, made as `child`, after par drops b */
const keys = (child: string) =>
  facts(
    `CREATE TABLE r (id int PRIMARY KEY);\n${PAR}CREATE TABLE ${child} INHERITS (par);\n` +
      "ALTER TABLE ch ADD FOREIGN KEY (b) REFERENCES r;\nALTER TABLE ch ADD PRIMARY KEY (b);\nALTER TABLE par DROP COLUMN b;",
  );

/** The columns each table of `sql`'s history declares itself */
const columns = (sql: string) =>
  Object.fromEntries([...facts(sql).tables].map(([table, own]) => [table, [...own].toSorted()]));

describe("a column down inheritance", () => {
  it("leaves a child the column ONLY kept as its own, and the parent without it", () => {
    expect(columns(`${CH}ALTER TABLE ONLY par DROP COLUMN b;`)).toEqual({ ch: ["b"], par: ["a"] });
    expect(columns(`${CH}ALTER TABLE par DROP COLUMN b;`)).toEqual({ ch: [], par: ["a"] });
  });

  it("leaves a child each column its parent gave it past NO INHERIT, and no parent", () => {
    const left = facts(`${CH}ALTER TABLE ch NO INHERIT par;`);
    expect([...(left.tables.get("ch") ?? [])].toSorted()).toEqual(["a", "b"]);
    expect(left.parents.has("ch")).toBe(false);

    const two = facts(
      `CREATE TABLE par2 (c int);\n${PAR}CREATE TABLE ch () INHERITS (par, par2);\nALTER TABLE ch NO INHERIT par;`,
    );

    expect(two.parents.get("ch")).toEqual([{ bound: undefined, parent: "par2", partition: false }]);

    const grand = facts(
      "CREATE TABLE gp (z int);\nCREATE TABLE par (a int) INHERITS (gp);\nCREATE TABLE ch () INHERITS (par);\nALTER TABLE ch NO INHERIT par;",
    );

    expect([...(grand.tables.get("ch") ?? [])].toSorted()).toEqual(["a", "z"]);
  });

  it("leaves a parent the history never made, or a table it never saw inherit, as it found it", () => {
    const ghost = facts("CREATE TABLE ch (x int) INHERITS (ghost);\nALTER TABLE ch NO INHERIT ghost;");
    expect([...(ghost.tables.get("ch") ?? [])]).toEqual(["x"]);
    expect(ghost.parents.has("ch")).toBe(false);
    const unseen = facts(`${PAR}ALTER TABLE ch NO INHERIT par;`);
    expect(unseen.tables.has("ch")).toBe(false);
    expect(unseen.parents.has("ch")).toBe(false);
  });

  it("reaches each table under a diamond once", () => {
    const diamond = facts(
      "CREATE TABLE a (c int);\nCREATE TABLE b1 () INHERITS (a);\nCREATE TABLE b2 () INHERITS (a);\nCREATE TABLE d () INHERITS (b1, b2);",
    );

    expect(descendants(diamond, "a")).toEqual(["a", "b1", "b2", "d"]);
    expect(droppedFrom(diamond, "a", { column: "c", recurse: true })).toEqual(["a", "b1", "b2", "d"]);
  });

  it("keeps a child the column another parent gives it, its own or from that parent's parent, and drops it where that parent has none", () => {
    const through = facts(
      "CREATE TABLE gp (b int);\nCREATE TABLE mid () INHERITS (gp);\nCREATE TABLE par (b int);\nCREATE TABLE ch () INHERITS (par, mid);",
    );

    expect(droppedFrom(through, "par", { column: "b", recurse: true })).toEqual(["par"]);
    const bare = facts(`CREATE TABLE par2 (c int);\n${PAR}CREATE TABLE ch () INHERITS (par, par2);`);
    expect(droppedFrom(bare, "par", { column: "b", recurse: true })).toEqual(["par", "ch"]);
  });
});

describe("a column down inheritance, renamed or keyed", () => {
  it("renames an inherited column's type on each table under the parent", () => {
    const renamed = facts(`${PAR}CREATE TABLE ch (b int) INHERITS (par);\nALTER TABLE par RENAME COLUMN b TO c;`);
    expect([...(renamed.columnTypes.get("ch")?.keys() ?? [])]).toEqual(["c"]);
  });

  it("drops a child's keys on a column it held from its parent alone, and keeps one it declared (sibling)", () => {
    const dropped = keys("ch ()");
    expect(dropped.foreignKeys).toEqual([]);
    expect(dropped.primaryKeys.has("ch")).toBe(false);
    const kept = keys("ch (b int)");
    expect(kept.foreignKeys.map((each) => each.table)).toEqual(["ch"]);
    expect(kept.primaryKeys.has("ch")).toBe(true);
  });

  it("holds a child to keep a column a parent the history never made may give it", () => {
    const seen = emptyFacts("public");
    seen.tables.set("par", new Set(["b"]));
    seen.tables.set("ch", new Set());
    seen.parents.set("ch", [
      { parent: "par", partition: false },
      { parent: "unseen", partition: false },
    ]);
    expect(droppedFrom(seen, "par", { column: "b", recurse: true })).toEqual(["par"]);
    seen.parents.set("ch", [{ parent: "par", partition: false }]);
    expect(droppedFrom(seen, "par", { column: "b", recurse: true })).toEqual(["par", "ch"]);
    expect(droppedFrom(seen, "par", { column: "b", recurse: false })).toEqual(["par"]);
  });
});
