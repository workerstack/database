/**
 * QE1 of r23: a trigger that writes another table fails that table's CHECK, and SQLite names the
 * CHECK alone. The handler looked only in the statement's table, so it answered the generic key
 * there. It now looks in the statement's table first, then answers the one other table that names
 * the CHECK; when two or more do, which one failed is unknown, so it answers generic with no table.
 */
import { describe, expect, it } from "vitest";

import { defined } from "../../tests/support/defined.ts";
import type { ConstraintMap } from "../types.ts";
import { constraintError } from "./constraint-handler.ts";

const LEDGER = { cause: "Amount must be positive", errorKey: "ledger_amount_invalid" };

const MAPS: ConstraintMap[] = [
  {
    ledger: { check: { ledger_amount_positive: LEDGER } },
    orders: { check: { orders_total_positive: { cause: "Total", errorKey: "orders_total_invalid" } } },
  },
];

/** What the handler answers for a CHECK named `name` failing behind `query`, under `maps` */
function failed(name: string, query: string | undefined, maps = MAPS) {
  const cause = Object.assign(new Error(`CHECK constraint failed: ${name}`), { code: "SQLITE_CONSTRAINT_CHECK" });
  const error = query === undefined ? cause : Object.assign(new Error(`Failed query: ${query}`, { cause }), { query });

  return constraintError(error, maps);
}

const ORDER_INSERT = 'insert into "orders" ("total") values (?)';

const GENERIC = { cause: "Data validation failed", errorKey: "check_constraint_violation", status: 400 };

describe("a CHECK a trigger fails in another table (QE1 of r23)", () => {
  it("answers the one other table that names it, with that table", () => {
    expect(failed("ledger_amount_positive", ORDER_INSERT)).toMatchObject({ ...LEDGER, status: 400, table: "ledger" });
  });

  it("answers generic with no table when two other tables name it", () => {
    const shared: ConstraintMap[] = [
      { ...MAPS[0], audit: { check: { ledger_amount_positive: { cause: "Audit", errorKey: "audit_invalid" } } } },
    ];

    expect(failed("ledger_amount_positive", ORDER_INSERT, shared)).toMatchObject({ ...GENERIC, table: undefined });
  });

  it("counts a table two maps list once (sibling)", () => {
    expect(
      failed("ledger_amount_positive", ORDER_INSERT, [
        defined(MAPS[0]),
        { ledger: { check: { ledger_amount_positive: LEDGER } } },
      ]),
    ).toMatchObject({
      errorKey: "ledger_amount_invalid",
      table: "ledger",
    });
  });

  it("answers the statement's table first, and its generic key when no table names the CHECK (sibling)", () => {
    expect(failed("orders_total_positive", ORDER_INSERT)).toMatchObject({
      errorKey: "orders_total_invalid",
      table: "orders",
    });
    expect(failed("total > 0", ORDER_INSERT)).toMatchObject({ ...GENERIC, table: "orders" });
  });

  it("holds a statement whose table is unknown to the same rule", () => {
    expect(failed("ledger_amount_positive", undefined)).toMatchObject({ ...LEDGER, table: "ledger" });
    expect(failed("total > 0", undefined)).toMatchObject({ ...GENERIC, table: undefined });
  });
});
