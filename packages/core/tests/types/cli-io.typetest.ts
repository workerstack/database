/**
 * KT7 of r22b: `runCli(argv, io)` takes what an embedder supplies, and nothing typed by database's
 * internals. Checked by `bun run typecheck`; nothing here runs.
 */
import { expectTypeOf } from "vitest"
import type { CliIo, MigrateRun, RunOptions, RunResult, CliTerminal } from "../../src/cli/index.ts"

/* the working folder, the two streams, a question, and the one process seam, which an embedder can type */
expectTypeOf<keyof CliIo>().toEqualTypeOf<"confirm" | "cwd" | "err" | "out" | "run">()
expectTypeOf<CliIo["run"]>().toEqualTypeOf<MigrateRun | undefined>()
expectTypeOf<MigrateRun>().parameters.toEqualTypeOf<[cmd: string, args: readonly string[], options?: RunOptions]>()
expectTypeOf<MigrateRun>().returns.toEqualTypeOf<Promise<RunResult>>()

/* Terminal is typed by the calls database makes, so it names no `NodeJS`: the process's own streams still fit it, and a number does not */
expectTypeOf(process.stdin).toExtend<CliTerminal["input"]>()
expectTypeOf(process.stderr).toExtend<CliTerminal["output"]>()
expectTypeOf<number>().not.toExtend<CliTerminal["output"]>()
expectTypeOf<{ write(chunk: number): void }>().not.toExtend<CliTerminal["output"]>()

/* the types 0.20.1 named, which an embedder's streams were typed by, fit it too */
expectTypeOf<NodeJS.ReadableStream & { isTTY?: boolean }>().toExtend<CliTerminal["input"]>()
expectTypeOf<NodeJS.WritableStream>().toExtend<CliTerminal["output"]>()
