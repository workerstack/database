/**
 * PA3 of r22b: database reads a migration file's header by Atlas's rule, held here to the pinned Atlas
 * itself. Each shape heads a file whose one statement is VACUUM, which SQLite refuses inside a
 * transaction: Atlas runs it when it reads `txmode none`, fails it in the file's transaction when it
 * reads no directive or `file`, and refuses the file, naming the txmode, for any other value. Atlas
 * reads the header the same on every dialect (sql/migrate/dir.go), so SQLite, which needs no server,
 * is the oracle for Postgres too. database runs on every Atlas in ATLAS_RANGE, so each shape is read by
 * the pinned v1.2.0 floor and by the Atlas on PATH alike, and one they read apart fails naming both.
 * Atlas locks a SQLite apply with a file in TMPDIR (atlas_migrate_execute.lock), one per machine
 * whatever the database, so each run takes its own TMPDIR: under another process's apply, the
 * shared one failed the run with "lock on atlas_migrate_execute already taken" (A's AA7 landing).
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { atlasHeader, type Txmode } from "../../src/migrate/core/atlas-header.ts"
import { ATLAS_FLOOR_VERSION, requireAtlasFloor } from "../support/atlas-floor.ts"

/* each header shape r22b's t-txmode-header.ts ran, and what it shows; the file's VACUUM follows it */
const SHAPES: Readonly<Record<string, string>> = {
	canonical: "-- atlas:txmode none\n\n",
	"a comment line first": "-- Build the index without blocking writes\n-- atlas:txmode none\n\n",
	"a comment line after": "-- atlas:txmode none\n-- Build the index without blocking writes\n\n",
	"blank line holding spaces": "-- atlas:txmode none\n \t \n",
	CRLF: "-- atlas:txmode none\r\n\r\n",
	"no space after --": "--atlas:txmode none\n\n",
	"tab after --": "--\tatlas:txmode none\n\n",
	"two spaces before none": "-- atlas:txmode  none\n\n",
	"value none-ish": "-- atlas:txmode none-ish\n\n",
	"upper NONE": "-- atlas:txmode NONE\n\n",
	"no blank line": "-- atlas:txmode none\n",
	"database:allow-unsafe line first": "-- database:allow-unsafe: vacuum online\n-- atlas:txmode none\n\n",
	"database:allow-unsafe line after": "-- atlas:txmode none\n-- database:allow-unsafe: vacuum online\n\n",
	"txmode file": "-- atlas:txmode file\n\n",
	"txmode all": "-- atlas:txmode all\n\n",
	/* a # line, which SQLite cannot run, read for a value Atlas refuses before it runs anything */
	"hash comment": "# atlas:txmode bogus\n\n",
	"two txmode lines": "-- atlas:txmode none\n-- atlas:txmode none\n\n",
	"many blank lines": "-- atlas:txmode none\n\n\n\n",
	"txmode with no value": "-- atlas:txmode\n\n",
	"an indented statement right after": "-- atlas:txmode none\n   ",
}

/* PA4 of r23: whole files whose header lines end in a bare CR, which Atlas reads as no line end */
const CR_FILES: Readonly<Record<string, string>> = {
	"a CR-only blank line and statement, ending in CR": "-- atlas:txmode none\r\rVACUUM;\r",
	"a CR-only blank line and statement, ending in none": "-- atlas:txmode none\r\rVACUUM;",
	"a CR-only blank line, the statement's line LF-ended": "-- atlas:txmode none\r\rVACUUM;\n",
	"a CR before the statement on the directive's LF line": "-- atlas:txmode none\rVACUUM;\n",
	"LF then a CRLF blank line": "-- atlas:txmode none\n\r\nVACUUM;\n",
	"CRLF then the statement": "-- atlas:txmode none\r\nVACUUM;\n",
	"a trailing CR before the LF blank line": "-- atlas:txmode none\r\n\nVACUUM;\n",
	"a directive with a CR inside its value": "-- atlas:txmode no\rne\n\nVACUUM;\n",
	"a space after the value": "-- atlas:txmode none \n\nVACUUM;\n",
	"a tab after the value": "-- atlas:txmode none\t\n\nVACUUM;\n",
	"a header alone, its directive unterminated": "-- atlas:txmode bogus",
	"a header alone, its directive CR-ended": "-- atlas:txmode bogus\r",
}

/* each Atlas the shapes are read by, by its version: the range's floor, and the one on PATH */
const ATLASES: Readonly<Record<string, string>> = {
	[`v${ATLAS_FLOOR_VERSION}`]: requireAtlasFloor(),
	[/v\d+\.\d+\.\d+/.exec(spawnSync("atlas", ["version"], { encoding: "utf8" }).stdout)?.[0] ?? "atlas on PATH"]:
		"atlas",
}

/**
 * `binary <args>` run to its end, with `env`; one that could not start or a signal ended throws,
 * naming which, as a SIGKILL'd apply prints nothing, which would read as "none" (A's AA9 run, a
 * hash that ended with no status under memory pressure)
 */
function ran(binary: string, args: readonly string[], env: NodeJS.ProcessEnv) {
	const run = spawnSync(binary, args, { encoding: "utf8", env })
	if (run.error !== undefined || run.signal !== null)
		throw new Error(
			`${binary} ${args.slice(0, 2).join(" ")} did not run to its end: ${run.error?.message ?? `ended by ${run.signal}`}`,
		)
	return run
}

/** How the Atlas `binary` ran `file`, a header and a VACUUM, as a txmode; any other failure throws Atlas's words */
function atlasRead(file: string, binary: string): Txmode {
	const dir = mkdtempSync(path.join(os.tmpdir(), "database-atlas-header-"))
	try {
		const migrations = path.join(dir, "m")
		mkdirSync(migrations)
		writeFileSync(path.join(migrations, "20260101000000_t.sql"), "CREATE TABLE t (x int);\n")
		writeFileSync(path.join(migrations, "20260102000000_v.sql"), file)
		const at = ["--dir", `file://${migrations}`]
		const env = { ...process.env, TMPDIR: dir }
		const hash = ran(binary, ["migrate", "hash", ...at], env)
		if (hash.status !== 0) throw new Error(`${binary} migrate hash exited ${hash.status}: ${hash.stderr}`)
		const apply = ran(binary, ["migrate", "apply", "--url", `sqlite://${path.join(dir, "db")}`, ...at], env)
		const said = `${apply.stdout}${apply.stderr}`
		/* a header Atlas did not read is sent as the statement's own text, which SQLite may read as all comment and run
		   nothing: Postgres ends a comment at a CR too and runs the VACUUM, in the file's transaction (PA4 of r23) */
		if (!said.includes("Error")) return /-> (?:--|#)[^\n]*atlas:/.test(said) ? "file" : "none"
		if (said.includes("cannot VACUUM from within a transaction")) return "file"
		/* Atlas names the file, which database's refusal leaves to the line that reports it */
		const refused = /^Error: (.*txmode.*)$/m.exec(said)?.[1]?.replace(' "20260102000000_v.sql"', "")
		if (refused === undefined) throw new Error(`${binary} failed the file outside its header: ${said}`)
		return { refused }
	} finally {
		rmSync(dir, { force: true, recursive: true })
	}
}

/** How each Atlas read `file`, by its version */
const readByAtlas = (file: string) =>
	Object.fromEntries(Object.entries(ATLASES).map(([version, binary]) => [version, atlasRead(file, binary)]))

/** How database reads `file`, under each Atlas's version */
const readBoth = (file: string) =>
	Object.fromEntries(Object.keys(ATLASES).map((version) => [version, atlasHeader(file).txmode]))

describe("database reads a txmode header as Atlas does (PA3; sibling: database's own -- database:allow-unsafe: line)", () => {
	it.each(Object.entries(SHAPES))("%s", (_, head) => {
		expect(readBoth(`${head}VACUUM;\n`)).toEqual(readByAtlas(`${head}VACUUM;\n`))
	})

	it.each(Object.entries(CR_FILES))("%s (PA4 of r23)", (_, file) => {
		expect(readBoth(file)).toEqual(readByAtlas(file))
	})
})
