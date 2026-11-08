/**
 * The CLI's checks of a path or a name a command or a config gives before it reaches the
 * filesystem, so a wrong kind is refused by name rather than as the error of whatever reads it.
 */
import fs from "node:fs"
import { CliError } from "./output.ts"

/**
 * Refuse `file`, which `what` names (an option or a config field), when it exists as other than a
 * file, saying what it is, then `fix`; a missing one is left to the caller, which refuses it its own way
 */
export function refuseNotFile(file: string, what: string, fix: string): void {
	const stat = fs.statSync(file, { throwIfNoEntry: false })
	if (stat === undefined || stat.isFile()) return
	throw new CliError(`${what} ${file} ${stat.isDirectory() ? "is a directory, not a file" : "is not a file"}: ${fix}`)
}

/**
 * Refuse a name a file is made from, `what` naming it, when it would name a path: one holding a
 * separator, or `.` or `..` alone; then `usage`
 */
export function refusePathName(name: string, what: string, usage: string): void {
	if (!/[/\\]/.test(name) && name !== "." && name !== "..") return
	throw new CliError(`${what} "${name}" names a path: give a name alone, such as add_users\n${usage}`)
}
