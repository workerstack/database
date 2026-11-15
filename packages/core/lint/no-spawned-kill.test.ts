import { describe, expect, it } from "vitest";

import plugin from "./index.js";
import { oxlintReports, reportsOf } from "./rule-harness.ts";

const rule = plugin.rules["no-spawned-kill"];

const MESSAGE =
  "a test spawns no kill, pkill or killall of a pid: signal a recorded process through tests/support/pid.ts";

const FILE = "packages/core/tests/integration/d1/spawns.test.ts";

const PID_KILL =
  'A test signals a pid it recorded through tests/support/pid.ts, which knows the process by its start time; vi.spyOn(process, "kill") stubs it';

const PID_PROBE =
  "A test probes a pid it recorded through tests/support/pid.ts, which knows the process by its start time";

const reports = (code: string) => reportsOf(rule, { [FILE]: code }).map((report) => report.message);

describe("database/no-spawned-kill", () => {
  it("rejects a kill, pkill or killall spawned, run by a path, or run through exec or a shell", () => {
    const kills = [
      'spawnSync("kill", ["-9", String(pid)])',
      'spawn("pkill", ["-f", "atlas"])',
      'execFile("killall", ["sleep"])',
      'execFileSync("kill", [String(pid)])',
      'cp.spawnSync("/bin/kill", [String(pid)])',
      "execSync(`kill ${pid}`)",
      'exec("echo stop; kill -TERM 123")',
      'spawn("sh", ["-c", `kill ${pid}`])',
      'spawnSync("bash", ["-e", "-c", "sleep 1 && pkill sleep"])',
    ];

    expect(kills.map(reports)).toEqual(kills.map(() => [MESSAGE]));
  });

  it("allows a shell's kill of its own $$, other commands, and calls it cannot read", () => {
    const others = [
      'spawn("sh", ["-c", "kill -9 $$"])',
      'spawnSync("sh", ["-c", "echo said >&2; kill -9 $$"])',
      'spawn("sh", ["-e"])',
      'spawn("sh", script)',
      'spawn("sh", ["-c", script])',
      'spawn("sleep", ["30"])',
      'execSync("echo skill")',
      "spawn(command, args)",
      "spawn(9)",
      'run("kill", [String(pid)])',
      'handlers[0]("kill", [])',
      '(() => spawn)()("kill", [])',
      'vi.spyOn(process, "kill")',
      'child.kill("SIGKILL")',
    ];

    expect(others.map(reports)).toEqual(others.map(() => []));
  });

  it("rejects a test's own process.kill, outside tests/support/pid.ts", () => {
    const code = 'process.kill(pid, "SIGTERM")\nconst signal = process.kill';
    expect(reports(code)).toEqual([PID_KILL, PID_KILL]);
    expect(reportsOf(rule, { "packages/core/tests/support/pid.ts": code })).toEqual([]);

    const spellings = [
      'process["kill"](pid)',
      "process.kill.call(process, pid)",
      "const { kill } = process",
      'const { "kill": stop } = process',
      "const { ['kill']: halt } = process",
    ];

    expect(spellings.map(reports)).toEqual(spellings.map(() => [PID_KILL]));

    const others = [
      "process[name](pid)",
      'process["pid"]',
      "child.kill(pid)",
      "process.pid",
      "this.process.kill(pid)",
      "const { pid } = process",
      "const { kill } = child",
      "const { [name]: x } = process",
      "const { ...rest } = process",
      "const [kill] = process",
      "const kill = process",
    ];

    expect(others.map(reports)).toEqual(others.map(() => []));
    expect(oxlintReports("no-spawned-kill", { [FILE]: code }).map((report) => report.message)).toEqual([
      PID_KILL,
      PID_KILL,
    ]);
  });

  it("rejects isAlive imported from migrate's cleanup, outside cleanup.test.ts", () => {
    const imports = [
      'import { isAlive } from "../../src/migrate/core/cleanup.ts"',
      'import { isAlive as alive } from "./cleanup.ts"',
      'import { isAlive, sweep } from "./cleanup-pids.ts"',
    ];

    expect(imports.map(reports)).toEqual(imports.map(() => [PID_PROBE]));

    const others = [
      'import { sweep } from "./cleanup.ts"',
      'import { isAlive } from "./support/pid.ts"',
      'import cleanup from "./cleanup.ts"',
    ];

    expect(others.map(reports)).toEqual(others.map(() => []));
    const own = "packages/core/src/migrate/core/cleanup.test.ts";
    expect(reportsOf(rule, { [own]: imports[1] as string })).toEqual([]);
  });
});
