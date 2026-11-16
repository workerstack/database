import { describe, expect, it } from "vitest";

import { besideTable } from "./pg-index-facts.ts";

describe("besideTable", () => {
  it("keys an index in its table's schema, unqualified in the history's", () => {
    expect(besideTable("t", "i", "public")).toBe("i");
    expect(besideTable("s.t", "i", "public")).toBe("s.i");
    expect(besideTable("public.t", "i", "public")).toBe("i");
  });
});
