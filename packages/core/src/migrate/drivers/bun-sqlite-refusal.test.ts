/**
 * KC5 of r23: a bun-sqlite provider run under Node failed with the loader's own error, which names
 * no provider and no Bun. Vitest runs on Node, so this file, which mocks nothing, imports the real
 * bun:sqlite and sees the refusal a Node CLI run sees.
 */
import { describe, expect, it } from "vitest";

import { bunLocal, createBunSqliteProvider } from "./bun-sqlite.ts";

const NEEDS_BUN =
  "The bun-sqlite provider needs Bun: bun:sqlite loads under Bun alone, and this process cannot load it. Run this command under bun, or set the provider to libsql or turso.";

describe("a bun-sqlite provider under Node (KC5 of r23)", () => {
  it("refuses a connection naming Bun, with the loader's error as its cause", async () => {
    const provider = { path: ":memory:", type: "bun-sqlite" } as const;

    const refused = await createBunSqliteProvider(provider)
      .connect({ migrationsDir: "m", name: "local", provider })
      .catch((error: unknown) => error);

    expect(refused).toEqual(new Error(NEEDS_BUN));
    expect((refused as Error).cause).toEqual(expect.any(Error));
  });

  it("refuses the private database the proof run and the lock probe open (sibling)", async () => {
    await expect(bunLocal()).rejects.toThrow(new Error(NEEDS_BUN));
  });
});
