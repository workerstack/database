import { describe, expect, it } from "vitest";

import { historyFacts } from "./pg-history.ts";
import { extractSchema } from "./schema.ts";

const facts = (sql: string) => historyFacts(extractSchema(sql, undefined, "postgres"), "public");
const relations = (sql: string) => [...facts(sql).relations].toSorted();

const checks = (sql: string) =>
  Object.fromEntries([...facts(sql).constraintNames].map(([table, names]) => [table, [...names].toSorted()]));

const FN = "CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END$$;\n";
const PARTITIONED = "CREATE TABLE p (v text, CONSTRAINT k CHECK (v <> '')) PARTITION BY LIST (v);\n";
const PARTITION = "CREATE TABLE p1 PARTITION OF p FOR VALUES IN ('a');\n";

// PA6 of r23: the pg_class and pg_constraint names an index Postgres names numbers past
describe("the relations a history keeps beside its tables, views and indexes", () => {
  it("keeps a sequence through its renames and moves, and drops it with its DROP", () => {
    expect(relations("CREATE SEQUENCE s;")).toEqual(["s"]);
    expect(relations("CREATE SEQUENCE s;\nALTER SEQUENCE s RENAME TO r;")).toEqual(["r"]);
    expect(relations("CREATE SEQUENCE s;\nALTER TABLE s RENAME TO r;")).toEqual(["r"]);
    expect(relations("CREATE SCHEMA o;\nCREATE SEQUENCE s;\nALTER SEQUENCE s SET SCHEMA o;")).toEqual(["o.s"]);
    expect(relations("CREATE SEQUENCE s;\nDROP SEQUENCE s;")).toEqual([]);
  });

  it("keeps a composite type, not an enum, through its rename, move and DROP", () => {
    expect(relations("CREATE TYPE c AS (a int);")).toEqual(["c"]);
    expect(relations("CREATE TYPE c AS ENUM ('a');")).toEqual([]);
    expect(relations("CREATE TYPE c AS (a int);\nALTER TYPE c RENAME TO d;")).toEqual(["d"]);
    expect(relations("CREATE SCHEMA o;\nCREATE TYPE c AS (a int);\nALTER TYPE c SET SCHEMA o;")).toEqual(["o.c"]);
    expect(relations("CREATE TYPE c AS (a int);\nDROP TYPE c;")).toEqual([]);
  });

  it("leaves a rename or move of a relation it does not keep alone", () => {
    expect(relations("CREATE TABLE t (a int);\nALTER TABLE t RENAME TO u;")).toEqual([]);
    expect(relations("CREATE SEQUENCE s;\nCREATE VIEW v AS SELECT 1;\nALTER VIEW v RENAME TO w;")).toEqual(["s"]);
  });
});

describe("the CHECK and constraint trigger names a history keeps by table", () => {
  it("keeps a named CHECK a CREATE TABLE writes, on a column or the table, and no unnamed one", () => {
    expect(checks("CREATE TABLE t (a int CONSTRAINT c CHECK (a > 0) UNIQUE, CONSTRAINT k CHECK (a < 9));")).toEqual({
      t: ["c", "k"],
    });
    expect(checks("CREATE TABLE t (a int CHECK (a > 0), UNIQUE (a));")).toEqual({});
  });

  it("hands a parent's CHECKs to each partition and child, which keep them once detached", () => {
    expect(checks(`${PARTITIONED}${PARTITION}`)).toEqual({ p: ["k"], p1: ["k"] });
    expect(
      checks(`${PARTITIONED}${PARTITION}ALTER TABLE p DETACH PARTITION p1;\nALTER TABLE p DROP CONSTRAINT k;`),
    ).toEqual({ p: [], p1: ["k"] });
    expect(checks("CREATE TABLE a (v text, CONSTRAINT k CHECK (v <> ''));\nCREATE TABLE b () INHERITS (a);")).toEqual({
      a: ["k"],
      b: ["k"],
    });
  });

  it("adds and drops a CHECK down the partitions, or on the table alone through ONLY", () => {
    const P = `CREATE TABLE p (v text) PARTITION BY LIST (v);\n${PARTITION}`;
    expect(checks(`${P}ALTER TABLE p ADD CONSTRAINT k CHECK (v <> '');`)).toEqual({ p: ["k"], p1: ["k"] });
    expect(checks(`${P}ALTER TABLE p ADD COLUMN w int CONSTRAINT c CHECK (w > 0);`)).toEqual({ p: ["c"], p1: ["c"] });
    expect(checks(`CREATE TABLE t (v text);\nALTER TABLE ONLY t ADD CONSTRAINT k CHECK (v <> '');`)).toEqual({
      t: ["k"],
    });
    expect(checks(`${PARTITIONED}${PARTITION}ALTER TABLE p DROP CONSTRAINT k;`)).toEqual({ p: [], p1: [] });
    expect(checks("CREATE TABLE t (v text);\nALTER TABLE t ADD UNIQUE (v);")).toEqual({});
  });

  it("follows a CHECK's rename on each table that holds it", () => {
    expect(checks(`${PARTITIONED}${PARTITION}ALTER TABLE p RENAME CONSTRAINT k TO m;`)).toEqual({
      p: ["m"],
      p1: ["m"],
    });
  });

  it("keeps a constraint trigger's name, not a plain trigger's, through its rename, and drops it with its DROP", () => {
    const T = `CREATE TABLE t (v text);\n${FN}`;
    const CONSTRAINT = `${T}CREATE CONSTRAINT TRIGGER c AFTER INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();\n`;
    expect(checks(CONSTRAINT)).toEqual({ t: ["c"] });
    expect(checks(`${T}CREATE TRIGGER c AFTER INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();`)).toEqual({});
    expect(checks(`${CONSTRAINT}ALTER TRIGGER c ON t RENAME TO d;`)).toEqual({ t: ["c"] });
    expect(checks(`${CONSTRAINT}DROP TRIGGER c ON t;`)).toEqual({ t: [] });
  });
});
