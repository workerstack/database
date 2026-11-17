import { describe, expect, it } from "vitest";

import plugin from "./index.js";
import { reportsOf } from "./rule-harness.ts";

const rule = plugin.rules["no-cleanup-probe"];

const MESSAGE =
  "a test probes a pid it recorded through tests/support/pid.ts, which knows the process by its start time, " +
  "not through cleanup.ts's isAlive";

const FILE = "packages/core/tests/integration/d1/probes.test.ts";

function reports(code: string): string[] {
  return reportsOf(rule, { [FILE]: code }).map((report) => report.message);
}

describe("database/no-cleanup-probe", () => {
  it("rejects isAlive imported from cleanup, by any path to it", () => {
    const probes = [
      'import { isAlive } from "./cleanup"',
      'import { isAlive } from "./cleanup.ts"',
      'import { isAlive } from "../migrate/core/cleanup.js"',
      'import { isAlive } from "cleanup"',
      'import { isAlive as alive } from "./cleanup"',
      'import { killAll, isAlive } from "./cleanup"',
    ];

    expect(probes.map(reports)).toStrictEqual(probes.map(() => [MESSAGE]));
  });

  it("allows the rest of cleanup, other kinds of import of it, and isAlive from elsewhere", () => {
    const others = [
      'import { reap } from "./cleanup"',
      'import * as cleanup from "./cleanup"',
      'import cleanup from "./cleanup"',
      'import { isAlive } from "./liveness"',
      'import { isAlive } from "./cleanup-helpers"',
      'import { isAlive } from "./precleanup"',
      'import "./cleanup"',
    ];

    expect(others.map(reports)).toStrictEqual(others.map(() => []));
  });
});
