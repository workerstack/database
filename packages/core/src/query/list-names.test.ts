import { describe, expect, it } from "vitest";
import * as z from "zod";

import { createListQuerySchema } from "./list-schema.ts";

/** The input JSON Schema properties of a query schema */
function inputProps(schema: z.ZodType) {
  return (z.toJSONSchema(schema, { io: "input" }) as { properties: Record<string, Record<string, unknown>> })
    .properties;
}

// CS3 of r23: a list with no sort field published an order param whose examples it refused
describe("a list with no sort field takes no order (CS3 of r23)", () => {
  const schema = createListQuerySchema({ filter: { name: "string" }, sort: [] });

  it("publishes no order param, and answers the default order", () => {
    expect(inputProps(schema)).not.toHaveProperty("order");
    expect(schema.parse({}).parsedSort).toEqual([]);
  });

  it("refuses an order, empty or not, as a key it does not take", () => {
    for (const order of ["", ".desc", ".asc"]) {
      const result = schema.safeParse({ order });
      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([expect.objectContaining({ code: "unrecognized_keys", keys: ["order"] })]);
    }
  });

  it("keeps the order param on a list that sorts (sibling)", () => {
    expect(inputProps(createListQuerySchema({ sort: ["name"] }))).toHaveProperty("order");
  });
});

// CS7 and QL11 of r23: a name the request grammar reads as another built, and published examples no request could meet
describe("a sort, filter or tiebreak name the request cannot spell refuses at build (CS7, QL11 of r23)", () => {
  it.each(["a,b", "asc", "desc", "nullslast", "a.desc", "a.nullsfirst", " pad", "pad ", ""])(
    "refuses the sort field %j",
    (field) => {
      expect(() => createListQuerySchema({ sort: [field] })).toThrow(
        new TypeError(
          `createListQuerySchema: sort field ${JSON.stringify(field)} cannot be named in an order param, which reads a comma, a leading or trailing space and a trailing .asc, .desc, .nullsfirst or .nullslast as its own; give the field a key without them`,
        ),
      );
    },
  );

  it.each(["a,b", " pad", "pad ", "a)", "or(a", ""])("refuses the filter field %j", (field) => {
    expect(() => createListQuerySchema({ filter: { [field]: "string" }, sort: ["id"] })).toThrow(
      new TypeError(
        `createListQuerySchema: filter field ${JSON.stringify(field)} cannot be named in a filter param, which does not read "${field}.eq.1" as one condition on it; give the field a key without a comma, a parenthesis or a leading or trailing space`,
      ),
    );
  });

  it.each([" ", "a,b", "\tid", "id.desc"])("refuses the tiebreak %j, a sort key no order can spell", (tiebreak) => {
    expect(() => createListQuerySchema({ sort: ["id"], tiebreak })).toThrow(
      new TypeError(
        `createListQuerySchema: tiebreak ${JSON.stringify(tiebreak)} cannot be named in an order param, which reads a comma, a leading or trailing space and a trailing .asc, .desc, .nullsfirst or .nullslast as its own; give the column a key without them`,
      ),
    );
  });

  it("builds dotted, prefixed and underscored names, and each example it publishes parses", () => {
    const schema = createListQuerySchema({
      filter: { "@score": "number", "author.name": "string", created_at: "date" },
      sort: ["author.name", "created_at", "_rank", "a b"],
      tiebreak: "_id",
    });

    const { filter, order } = inputProps(schema);
    const examples = { filter: filter?.["examples"] as string[], order: order?.["examples"] as string[] };
    expect(examples.filter.length).toBeGreaterThan(0);
    expect(examples.order.length).toBeGreaterThan(0);

    for (const [key, values] of Object.entries(examples))
      for (const value of values) expect(schema.safeParse({ [key]: value }).success, `${key}=${value}`).toBe(true);
  });
});
