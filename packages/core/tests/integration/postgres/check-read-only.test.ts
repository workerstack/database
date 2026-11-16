/**
 * PA5 of r23: a transactional file whose tail makes its transaction read-only passed check, then
 * failed every apply at Atlas's revision write, which runs in that transaction (25006). Check reads
 * the file's transaction at its end, so it refuses what apply's write would.
 */
import { describe, expect, it } from "vitest";

import { pgCheck, T } from "../support/pg-check.ts";

const { checkThenApply } = pgCheck();

// each tail is a kind database does not rate: the file approves it
const INSERT = "-- database:allow-unsafe: the test's tail\nINSERT INTO t (id) VALUES (1);\n";

describe("check of a transactional file that ends read-only (PA5 of r23)", () => {
  it.each([
    ["SET TRANSACTION READ ONLY", "SET TRANSACTION READ ONLY;\n"],
    ["SET LOCAL transaction_read_only", "SET LOCAL transaction_read_only = on;\n"],
    ["set_config local", "SELECT set_config('transaction_read_only', 'on', true);\n"],
  ])("refuses a %s tail with the revision write apply fails at", async (_, tail) => {
    const { apply, check } = await checkThenApply(T, `${INSERT}${tail}`);
    expect(apply).toContain("read-only transaction (25006)");
    expect(check).toContain(
      "20260102000000_two.sql: write revision: cannot execute INSERT in a read-only transaction (25006)",
    );
  });

  it("passes a SET LOCAL search_path tail, which apply writes the revision after (sibling)", async () => {
    expect(await checkThenApply(T, `${INSERT}SET LOCAL search_path = '';\n`)).toEqual({
      apply: undefined,
      check: undefined,
    });
  });
});
