import { describe, expect, it } from "vitest";

import plugin from "./index.js";
import { reportsOf } from "./rule-harness.ts";

const rule = plugin.rules["no-process-kill"];

const MESSAGE =
  "a test signals a pid it recorded through tests/support/pid.ts, which knows the process by its start time; " +
  'vi.spyOn(process, "kill") stubs it';

const FILE = "packages/core/tests/integration/d1/signals.test.ts";

function reports(code: string): string[] {
  return reportsOf(rule, { [FILE]: code }).map((report) => report.message);
}

describe("database/no-process-kill", () => {
  it("rejects process.kill read as a member, by a literal key, or taken out by destructuring", () => {
    const kills = [
      "process.kill(pid)",
      'process["kill"](pid)',
      "const { kill } = process",
      'const { ["kill"]: k } = process',
    ];

    expect(kills.map(reports)).toStrictEqual(kills.map(() => [MESSAGE]));
  });

  it("allows other process members, other objects' kill, and reads it cannot resolve to kill", () => {
    const others = [
      "other.kill()",
      "process.exit()",
      "process[name]()",
      "process[0]",
      "const { exit } = process",
      "const { ...rest } = process",
      "const p = process",
      "const { kill } = other",
      "const { kill } = process.env",
      "const { [name]: k } = process",
      "for (const { kill } of xs) {}",
      "class A { #kill = 1; m() { return process.#kill } }",
    ];

    expect(others.map(reports)).toStrictEqual(others.map(() => []));
  });
});
