import { describe, expect, it } from "vitest";

import { assertLimitWithin, assertPageWithin, assertSchemaParsed } from "./trusted.ts";

const ast = {
  root: {
    conditions: [{ field: "password_hash", operator: "like" as const, value: "a*" }],
    logic: "and" as const,
    subgroups: [],
  },
};

describe("assertSchemaParsed (S-M8)", () => {
  it("refuses a filter that did not come through the list schema, which would query any column", () => {
    expect(() => assertSchemaParsed({ filterAst: ast, parsedSort: [] })).toThrow(
      expect.objectContaining({ errorKey: "filter_not_wired", status: 500 }),
    );
  });

  it("refuses an order that did not come through the list schema", () => {
    expect(() =>
      assertSchemaParsed({ filterAst: null, parsedSort: [{ direction: "asc", field: "password_hash" }] }),
    ).toThrow(expect.objectContaining({ errorKey: "sort_not_wired", status: 500 }));
  });

  it("passes the schema's output, and a request with neither a filter nor an order", () => {
    expect(() =>
      assertSchemaParsed({ filterAst: ast, parsedSort: [{ direction: "asc", field: "id" }], validated: true }),
    ).not.toThrow();
    expect(() => assertSchemaParsed({ filterAst: null, parsedSort: [] })).not.toThrow();
  });
});

describe("assertPageWithin: a page no schema bounded (C4)", () => {
  it("refuses a hand-built page past the default maxPage with a 400, and trusts the schema's own bound", () => {
    expect(() => assertPageWithin({ page: 10_000 })).not.toThrow();
    expect(() => assertPageWithin({ page: 10_001 })).toThrow(
      expect.objectContaining({ errorKey: "page_too_deep", status: 400 }),
    );
    // a schema configured with a deeper maxPage says so with its bound, which holds the page (C7 of r19)
    expect(() => assertPageWithin({ page: 50_000, pageBound: 50_000 })).not.toThrow();
    expect(() => assertPageWithin({ page: 50_001, pageBound: 50_000 })).toThrow(
      expect.objectContaining({ errorKey: "page_too_deep", status: 400 }),
    );
    expect(() => assertPageWithin({})).not.toThrow();
  });
});

// U5 of the 0.12 round: a page no schema validated is a whole number from 1, in both builders
// U29: validated: true says the filter and order were checked, never that the page was
describe("assertPageWithin: a page on a filter its caller checked itself", () => {
  it.each([0, -1, 1.5, Number.NaN])("refuses page %s with invalid_page, validated or not", (page) => {
    expect(() => assertPageWithin({ page, validated: true })).toThrow(
      expect.objectContaining({ errorKey: "invalid_page" }),
    );
    expect(() => assertPageWithin({ page, pageBound: 50_000 })).toThrow(
      expect.objectContaining({ errorKey: "invalid_page" }),
    );
  });

  it("refuses a page past the default maxPage when only the filter was checked", () => {
    expect(() => assertPageWithin({ page: 10_001, validated: true })).toThrow(
      expect.objectContaining({ errorKey: "page_too_deep" }),
    );
  });
});

describe("assertPageWithin: a page that is no page", () => {
  it.each([0, -1, 1.5, Number.NaN])("refuses page %s with invalid_page", (page) => {
    expect(() => assertPageWithin({ page })).toThrow(
      expect.objectContaining({
        cause: `page ${page} is not a whole number from 1`,
        errorKey: "invalid_page",
        status: 400,
      }),
    );
  });
});

/** The 500 for a stated bound, its cause naming `key` */
const notWired = (key: string) =>
  expect.objectContaining({ cause: expect.stringContaining(key), errorKey: "page_not_wired", status: 500 });

// QL9 of r23: a stated bound that is no safe whole number, or whose last offset passes 2^53, was trusted
describe("a stated pageBound or limitBound no list schema could state (QL9 of r23)", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, 2.5, 0, -1])(
    "refuses pageBound %s on the page and the limit",
    (pageBound) => {
      expect(() => assertPageWithin({ page: 1, pageBound })).toThrow(notWired("pageBound"));
      expect(() => assertLimitWithin({ limit: 1, pageBound })).toThrow(notWired("pageBound"));
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 2.5, 0, -1])(
    "refuses limitBound %s on the page and the limit",
    (limitBound) => {
      expect(() => assertPageWithin({ limitBound, page: 1 })).toThrow(notWired("limitBound"));
      expect(() => assertLimitWithin({ limit: 1, limitBound })).toThrow(notWired("limitBound"));
    },
  );

  it("refuses bounds whose last offset passes 2^53 - 1, and passes the largest that does not", () => {
    const big = { limitBound: 2 ** 26, pageBound: 2 ** 27 + 2 };
    expect(() => assertPageWithin({ ...big, page: 1 })).toThrow(notWired("(pageBound - 1) * limitBound"));
    expect(() => assertLimitWithin({ ...big, limit: 1 })).toThrow(notWired("(pageBound - 1) * limitBound"));
    const edge = { limitBound: 1, pageBound: Number.MAX_SAFE_INTEGER };
    expect(() => assertPageWithin({ ...edge, page: 1 })).not.toThrow();
    expect(() => assertLimitWithin({ ...edge, limit: 1 })).not.toThrow();
  });

  it("holds a stated pageBound alone against the default maxLimit (sibling)", () => {
    expect(() => assertPageWithin({ page: 50_000, pageBound: 50_000 })).not.toThrow();
    expect(() => assertPageWithin({ page: 1, pageBound: Number.MAX_SAFE_INTEGER })).toThrow(
      notWired("(pageBound - 1) * limitBound"),
    );
  });
});
