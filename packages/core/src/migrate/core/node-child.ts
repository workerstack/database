/**
 * A module of database's run in a child on the runtime wrangler runs on (node), through process.ts,
 * whatever runtime database itself runs on: handed its input as JSON in a scratch directory, it writes its
 * answer to a file there, as what it loads prints to stdout. d1-engine.ts proves the pending files in one,
 * and d1-binding.ts reads the wrangler config in one, so nothing wrangler prints reaches database's stdout,
 * where `--json` writes the one object a deploy script reads.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { scratchDir } from "./cleanup.ts";
import type { MigrateRun, ProjectBin, RunResult } from "./process.ts";

// what node runs, as a module file in the scratch directory: it imports the child module and writes its
// answer to a file. Not \`node -e\`: wrangler 4's getPlatformProxy never resolves in an evaluated module
const SHIM = `const [child, input, output] = process.argv.slice(2)
const { main } = await import(child)
const { writeFileSync } = await import("node:fs")
writeFileSync(output, JSON.stringify(await main(input)))`;

/**
 * What the child module at `child` answers for the input `inputOf` makes in the scratch directory, run on
 * `bin`'s runtime by `exec`; `failed` says what failed when the child wrote no answer, from how it ended
 */
async function runChild<Answer>(
  child: URL,
  {
    bin,
    exec,
    failed,
    inputOf,
    prefix,
  }: {
    bin: ProjectBin;
    exec: MigrateRun;
    failed: (ran: RunResult) => string;
    inputOf: (dir: string) => unknown;
    prefix: string;
  },
): Promise<Answer> {
  const { dir, remove } = scratchDir(prefix);

  try {
    const input = join(dir, "input.json");
    const output = join(dir, "result.json");
    writeFileSync(input, JSON.stringify(await inputOf(dir)));
    const shim = join(dir, "child.mjs");
    writeFileSync(shim, SHIM);
    const ran = await exec(bin.runtime, [shim, child.href, input, output], { peer: bin.peer });

    if (!existsSync(output)) throw new Error(failed(ran));

    return JSON.parse(readFileSync(output, "utf8")) as Answer;
  } finally {
    remove();
  }
}

/** How a child that wrote no answer ended: its code, and what it printed to stderr */
const endedWith = (ran: RunResult): string =>
  `ended with code ${ran.code} and no answer: ${ran.stderr.trim() || "it printed nothing"}`;

export { endedWith, runChild };
