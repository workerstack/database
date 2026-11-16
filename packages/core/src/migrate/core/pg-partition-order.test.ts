/**
 * The order database reads a partitioned table's partitions in, Postgres's partition descriptor's
 * (PA7 of r23), and when it cannot tell it; the histories Postgres 17 names by it are pinned in
 * tests/support/pg-index-cases-taken.ts.
 */
import { describe, expect, it } from "vitest";

import { historyFacts } from "./pg-history.ts";
import { emptyFacts } from "./pg-nodes.ts";
import { lineage, partitionsOf } from "./pg-partition-order.ts";
import { extractSchema } from "./schema.ts";

/** The partitions of `r` after `r` partitioned by `spec` and a partition named p1, p2, … per bound */
function order(spec: string, bounds: readonly string[]): { children: string[]; sure: boolean } {
  const sql = [
    `CREATE TABLE r (a int, b int, at timestamptz, t text, f boolean) PARTITION BY ${spec};`,
    ...bounds.map((bound, i) => `CREATE TABLE p${i + 1} PARTITION OF r ${bound};`),
  ].join("\n");

  return partitionsOf(historyFacts(extractSchema(sql, undefined, "postgres"), "public"), "r");
}

describe("lineage", () => {
  it("walks a table's partitions and theirs, in their bounds' order", () => {
    const facts = historyFacts(
      extractSchema(
        [
          "CREATE TABLE p (id int, at date) PARTITION BY RANGE (at);",
          "CREATE TABLE p2 PARTITION OF p FOR VALUES FROM ('2021-01-01') TO ('2022-01-01') PARTITION BY LIST (id);",
          "CREATE TABLE p1 PARTITION OF p FOR VALUES FROM ('2020-01-01') TO ('2021-01-01');",
          "CREATE TABLE p2a PARTITION OF p2 FOR VALUES IN (1);",
          "CREATE TABLE plain (id int);",
        ].join("\n"),
        undefined,
        "postgres",
      ),
      "public",
    );

    expect(lineage(facts, "p")).toEqual(["p", "p1", "p2", "p2a"]);
    expect(lineage(facts, "plain")).toEqual(["plain"]);
  });
});

describe("partitionsOf", () => {
  it("orders RANGE partitions by each column of the lower bound in turn, MINVALUE first and MAXVALUE last", () => {
    const bounds = [
      "FOR VALUES FROM (1, MAXVALUE) TO (2, 0)",
      "FOR VALUES FROM (1, 5) TO (1, MAXVALUE)",
      "FOR VALUES FROM (MINVALUE, MINVALUE) TO (1, 5)",
    ];

    expect(order("RANGE (a, b)", bounds)).toEqual({ children: ["p3", "p2", "p1"], sure: true });
  });

  it("orders MINVALUE and MAXVALUE against dates, hash partitions by modulus then remainder, and a zero", () => {
    const edges = ["FOR VALUES FROM ('2020-01-01') TO (MAXVALUE)", "FOR VALUES FROM (MINVALUE) TO ('2020-01-01')"];
    expect(order("RANGE (at)", edges)).toEqual({ children: ["p2", "p1"], sure: true });

    const hashes = [
      "FOR VALUES WITH (MODULUS 4, REMAINDER 1)",
      "FOR VALUES WITH (MODULUS 4, REMAINDER 0)",
      "FOR VALUES WITH (MODULUS 2, REMAINDER 1)",
    ];

    expect(order("HASH (a)", hashes)).toEqual({ children: ["p3", "p2", "p1"], sure: true });
    expect(
      order("RANGE (a)", ["FOR VALUES FROM (1) TO (2)", "FOR VALUES FROM (0) TO (1)", "FOR VALUES FROM (-1) TO (0)"]),
    ).toEqual({
      children: ["p3", "p2", "p1"],
      sure: true,
    });
  });

  it("keeps two partitions of one bound, which Postgres refuses, as the history wrote them", () => {
    expect(order("RANGE (a)", ["FOR VALUES FROM (1) TO (2)", "FOR VALUES FROM (1) TO (3)"])).toEqual({
      children: ["p1", "p2"],
      sure: true,
    });
  });

  it("orders timestamps written with a T or a space, cast or not, and decimals", () => {
    const times = [
      "FOR VALUES FROM ('2020-01-01T12:00') TO (MAXVALUE)",
      "FOR VALUES FROM ('2020-01-01'::timestamptz) TO ('2020-01-01 12:00')",
    ];

    expect(order("RANGE (at)", times)).toEqual({ children: ["p2", "p1"], sure: true });
    expect(order("RANGE (a)", ["FOR VALUES FROM (1.5) TO (2)", "FOR VALUES FROM (-0.5) TO (1.5)"])).toEqual({
      children: ["p2", "p1"],
      sure: true,
    });
  });

  it("orders LIST partitions by their least value, booleans as Postgres does, a NULL alone after and DEFAULT last", () => {
    expect(order("LIST (f)", ["DEFAULT", "FOR VALUES IN (true)", "FOR VALUES IN (false)"])).toEqual({
      children: ["p3", "p2", "p1"],
      sure: true,
    });
    expect(order("LIST (a)", ["FOR VALUES IN (NULL)", "FOR VALUES IN (9, NULL, 4, 6)", "FOR VALUES IN (5)"])).toEqual({
      children: ["p2", "p3", "p1"],
      sure: true,
    });
  });
});

describe("partitionsOf where database cannot order them", () => {
  it("keeps the history's order, not sure of it, where a bound sorts as a collation would", () => {
    expect(order("LIST (t)", ["FOR VALUES IN ('b')", "FOR VALUES IN ('a')"])).toEqual({
      children: ["p1", "p2"],
      sure: false,
    });
    expect(order("RANGE (t)", ["FOR VALUES FROM ('b') TO ('c')", "FOR VALUES FROM ('a') TO ('b')"])).toEqual({
      children: ["p1", "p2"],
      sure: false,
    });
    expect(order("RANGE (a)", ["FOR VALUES FROM (a + 1) TO (5)"])).toEqual({ children: ["p1"], sure: true });
    expect(order("LIST (t)", ["FOR VALUES IN ('')", "FOR VALUES IN (B'1')"])).toEqual({
      children: ["p1", "p2"],
      sure: false,
    });
    expect(order("RANGE (a)", ["FOR VALUES FROM (NULL) TO (1)", "FOR VALUES FROM (1) TO (2)"])).toEqual({
      children: ["p1", "p2"],
      sure: false,
    });
  });

  it("is not sure of values it can read but not compare, and of a partition whose bound it was not given", () => {
    expect(order("LIST (at)", ["FOR VALUES IN ('2020-01-01')", "FOR VALUES IN (5, '2020-01-02')"])).toEqual({
      children: ["p1", "p2"],
      sure: false,
    });
    expect(order("LIST (at)", ["FOR VALUES IN ('2020-01-02')", "FOR VALUES IN (5)"])).toEqual({
      children: ["p1", "p2"],
      sure: false,
    });
    const facts = emptyFacts("public");
    facts.parents.set("q", [{ parent: "r", partition: true }]);
    facts.parents.set("s", [{ parent: "r", partition: false }]);
    expect(partitionsOf(facts, "r")).toEqual({ children: ["q"], sure: true });
    facts.parents.set("q2", [{ parent: "r", partition: true }]);
    expect(partitionsOf(facts, "r")).toEqual({ children: ["q", "q2"], sure: false });
  });
});
