/** @workerstack/database/cli: run the database CLI in process. */
export { CliError, type CliIo, processIo } from "./output.ts"
export { help, runCli } from "./run.ts"
export type { CliTerminal } from "./output.ts"
export type { BinPeer, MigrateRun, RunOptions, RunResult } from "../migrate/core/process.ts"
