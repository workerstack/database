import { describe, expect, it } from "vitest";
import { z } from "zod";

import { intervalRule, timeRule, timestampRule } from "./pg-time-rules.ts";

/** The zod schema a rule's source string builds */
const schemaOf = (source: string): z.ZodType => new Function("z", `return ${source}`)(z) as z.ZodType;

const takes = (source: string, values: readonly string[]): boolean[] =>
  values.map((value) => schemaOf(source).safeParse(value).success);

describe("the time, timestamp and interval rules", () => {
  it("hold a time's fraction to its precision, with or without an offset", () => {
    expect(takes(timeRule({ precision: 3, withTimeZone: false }), ["12:00:00.123", "12:00:00.1234"])).toEqual([
      true,
      false,
    ]);
    expect(takes(timeRule({ precision: 0, withTimeZone: true }), ["12:00:00Z", "12:00:00.1Z"])).toEqual([true, false]);
  });

  it("take a timestamp only in the form whose instant it keeps", () => {
    expect(
      takes(timestampRule({ precision: 6, withTimeZone: false }), ["2024-01-01T00:00:00", "2024-01-01T00:00:00Z"]),
    ).toEqual([true, false]);
    expect(
      takes(timestampRule({ precision: 6, withTimeZone: true }), ["2024-01-01T00:00:00Z", "2024-01-01T00:00:00"]),
    ).toEqual([true, false]);
  });

  it("take an interval with no part below its last field and no fraction past its precision", () => {
    expect(takes(intervalRule({ field: "day", precision: 6 }), ["P1D", "PT1H"])).toEqual([true, false]);
    expect(takes(intervalRule({ field: null, precision: 0 }), ["PT1S", "PT1.5S"])).toEqual([true, false]);
  });
});
