import { beforeAll, describe, expect, it } from "vitest";

import { insideOnly } from "./pg-inside-transaction.ts";
import { nodeOf } from "./pg-outside-transaction.ts";
import { loadPostgresParser, parsePostgres } from "./pg-parser.ts";

beforeAll(loadPostgresParser);

// PA13 of r22b: what a txmode none file sends bare, so Postgres refuses it outside a block as apply's does
describe("insideOnly", () => {
  it.each([
    ["LOCK TABLE t IN SHARE MODE", "LOCK TABLE"],
    ["SAVEPOINT s", "SAVEPOINT"],
    ["RELEASE s", "RELEASE SAVEPOINT"],
    ["ROLLBACK TO s", "ROLLBACK TO SAVEPOINT"],
    ["DECLARE c CURSOR FOR SELECT 1", "DECLARE CURSOR"],
    ["DECLARE c CURSOR WITH HOLD FOR SELECT 1", undefined],
    // PA18 of r23: the ones Postgres only warns of bare, and drops
    ["SET TRANSACTION ISOLATION LEVEL SERIALIZABLE", "SET TRANSACTION"],
    ["SET TRANSACTION SNAPSHOT '00000003-0000001B-1'", "SET TRANSACTION"],
    ["SET LOCAL TRANSACTION READ ONLY", "SET TRANSACTION"],
    ["SET LOCAL lock_timeout = '1s'", "SET LOCAL"],
    ["SET CONSTRAINTS ALL DEFERRED", "SET CONSTRAINTS"],
    ["SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY", undefined],
    ["SET lock_timeout = '1s'", undefined],
    ["BEGIN", undefined],
    ["SELECT 1", undefined],
  ])("names %s as %s", (sql, named) => {
    expect(insideOnly(...nodeOf(parsePostgres(sql).stmts))).toBe(named);
  });

  // the gate's pin (database-9d): libpg-query sets a DECLARE's options on every form a history can hold,
  // which insideOnly reads with no fallback; a parser that drops them fails here, before a NaN
  // reads every cursor as one without WITH HOLD
  it.each([
    "DECLARE c CURSOR FOR SELECT 1",
    "DECLARE c BINARY CURSOR FOR SELECT 1",
    "DECLARE c INSENSITIVE CURSOR FOR SELECT 1",
    "DECLARE c ASENSITIVE CURSOR FOR SELECT 1",
    "DECLARE c SCROLL CURSOR FOR SELECT 1",
    "DECLARE c NO SCROLL CURSOR FOR SELECT 1",
    "DECLARE c CURSOR WITH HOLD FOR SELECT 1",
    "DECLARE c CURSOR WITHOUT HOLD FOR SELECT 1",
    "DECLARE c BINARY INSENSITIVE SCROLL CURSOR WITH HOLD FOR SELECT 1",
  ])("reads the integer options the parser sets on %s", (sql) => {
    const [type, node] = nodeOf(parsePostgres(sql).stmts);
    expect([type, Number.isInteger(node["options"])]).toEqual(["DeclareCursorStmt", true]);
  });
});
