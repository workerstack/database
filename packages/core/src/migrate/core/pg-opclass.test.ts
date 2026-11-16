/**
 * The operator class an element that spells none takes. tests/integration/postgres/opclass-defaults.test.ts
 * holds every built-in type to Postgres 17; these read the types it cannot reach that way.
 */
import { describe, expect, it } from "vitest";

import { defaultClass } from "./pg-opclass.ts";

const column = (type: string, dims = 0) => ({ collation: undefined, dims, mods: [], type });

describe("defaultClass", () => {
  it("takes an array's by the polymorphic class, whatever its element", () => {
    expect(defaultClass("btree", column("my.thing", 1))).toBe("array_ops");
    expect(defaultClass("gin", column("text", 2))).toBe("array_ops");
  });

  it("knows none for an enum, an extension's type or an access method it does not know", () => {
    expect(defaultClass("btree", column("mood"))).toBeUndefined();
    expect(defaultClass("btree", column("citext"))).toBeUndefined();
    expect(defaultClass("bloom", column("int4"))).toBeUndefined();
  });
});
