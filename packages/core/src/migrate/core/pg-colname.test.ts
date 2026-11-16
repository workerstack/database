/**
 * The name an index gives an expression column, as FigureIndexColname figures it. The expressions an
 * index on Postgres 17 can hold are held to it by EXPRESSION_CASES (tests/support/pg-index-cases-expressions.ts);
 * these read the constructs those leave out, whose results need a cast before an index takes them.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { figureName } from "./pg-colname.ts";
import type { Node } from "./pg-nodes.ts";
import { loadPostgresParser, parsePostgres } from "./pg-parser.ts";

beforeAll(loadPostgresParser);

/** The name figured for the one expression of `CREATE INDEX ON t ((expr))` */
function nameOf(expr: string): string | undefined {
  const [{ stmt }] = parsePostgres(`CREATE INDEX ON t ((${expr}));`).stmts as [{ stmt: Node }];
  const [param] = (stmt["IndexStmt"] as Node)["indexParams"] as [Node];

  return figureName((param["IndexElem"] as Node)["expr"]);
}

describe("figureName", () => {
  it.each([
    ["JSON_OBJECT('a': b)", "json_object"],
    ["JSON_ARRAY(b)", "json_array"],
    ["JSON_ARRAY(SELECT 1)", "json_array"],
    ["JSON(a)", "json"],
    ["JSON_SCALAR(b)", "json_scalar"],
    ["JSON_SERIALIZE(j)", "json_serialize"],
    ["JSON_QUERY(j, '$')", "json_query"],
    ["JSON_EXISTS(j, '$')", "json_exists"],
    ["xmlelement(name x)", "xmlelement"],
    ["xmlconcat(x, y)", "xmlconcat"],
    ["xmlforest(a)", "xmlforest"],
    ["xmlparse(document a)", "xmlparse"],
    ["xmlpi(name x)", "xmlpi"],
    ["xmlroot(x, version '1')", "xmlroot"],
    ["xmlserialize(document x AS text)", "xmlserialize"],
    ["(r).*", "r"],
    ["(ARRAY[b])[1]", "array"],
  ])("names %s %j", (expr, name) => {
    expect(nameOf(expr)).toBe(name);
  });

  it.each(["b + 1", "NOT b", "b IS NULL"])("figures no name for %s, which the index names expr", (expr) => {
    expect(nameOf(expr)).toBeUndefined();
  });
});
