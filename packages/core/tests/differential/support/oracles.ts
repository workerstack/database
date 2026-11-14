/**
 * The published releases the differential compares the tip with, each installed from npm into a box of its own
 * under ~/.cache/database-test/diff/<version>: its package.json and bun.lock from ../oracles/<version>, and a copy
 * of entry.ts that resolves inside it. Nothing above ~/.cache holds a package.json, so a box resolves only what
 * it installed; a box inside the repo would resolve database's own dev packages. Peers are left out (`--omit=peer`):
 * a list needs only the drizzle, libsql and zod the box pins, and the migrate CLI runs the project's wrangler.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/* the previous release, whose fixes the tip keeps, and the one before it, which some of the tip's fixes regress */
export const ORACLES = ["0.21.0", "0.20.1"] as const
export type Oracle = (typeof ORACLES)[number]
export type Version = "tip" | Oracle
export const VERSIONS: readonly Version[] = ["tip", ...ORACLES]

const SOURCES = join(import.meta.dirname, "../oracles")

/** The approval line `version`'s check reads, as that release spells it (oracles/<version>/approval.sql) */
export const approvalOf = (version: Oracle): string => readFileSync(join(SOURCES, version, "approval.sql"), "utf8")
const BOXES = join(homedir(), ".cache/database-test/diff")
const COPIED = {
	"entry-bun.ts": join(import.meta.dirname, "entry-bun.ts"),
	"entry-cli.ts": join(import.meta.dirname, "entry-cli.ts"),
	"entry.ts": join(import.meta.dirname, "entry.ts"),
}

/** What a box is made from: its manifest, its lock and the entries copied in, keyed by the name each takes there */
function sources(version: Oracle): Record<string, string> {
	return {
		"bun.lock": join(SOURCES, version, "bun.lock"),
		"package.json": join(SOURCES, version, "package.json"),
		...COPIED,
	}
}

/** The hash of every file a box is made from, which the box records once its install finished */
function stamp(version: Oracle): string {
	const hash = createHash("sha256")
	for (const [name, file] of Object.entries(sources(version))) hash.update(`${name}\0${readFileSync(file, "utf8")}\0`)
	return hash.digest("hex")
}

/** The box of `version`; nothing checks it is installed (installOracle does) */
export const boxOf = (version: Oracle): string => join(BOXES, version)

/**
 * The box of `version`, installed from its lock if it is absent or was made from other files. The install runs in
 * a directory of its own, renamed into place once it finished, so a run stopped halfway leaves no box a later run
 * trusts, and two runs installing at once both end with a whole box.
 */
export function installOracle(version: Oracle): string {
	const box = boxOf(version)
	const want = stamp(version)
	const stampFile = join(box, ".stamp")
	if (existsSync(stampFile) && readFileSync(stampFile, "utf8") === want) return box
	mkdirSync(BOXES, { recursive: true })
	const staging = `${box}.${process.pid}.${Date.now()}`
	mkdirSync(staging)
	for (const [name, file] of Object.entries(sources(version))) cpSync(file, join(staging, name))
	const installed = spawnSync("bun", ["install", "--frozen-lockfile", "--omit=peer"], {
		cwd: staging,
		encoding: "utf8",
	})
	if (installed.status !== 0) {
		rmSync(staging, { force: true, recursive: true })
		throw new Error(`bun install of database ${version} failed:\n${installed.stdout}${installed.stderr}`)
	}
	writeFileSync(join(staging, ".stamp"), want)
	rmSync(box, { force: true, recursive: true })
	try {
		renameSync(staging, box)
	} catch (error) {
		/* another run renamed its whole box into place first */
		rmSync(staging, { force: true, recursive: true })
		if (!existsSync(stampFile) || readFileSync(stampFile, "utf8") !== want) throw error
	}
	return box
}

/** The entry module of `version`: the tip's own, or the copy in its box */
export const entryOf = (version: Version, name: keyof typeof COPIED = "entry.ts"): string =>
	version === "tip" ? COPIED[name] : join(boxOf(version), name)
