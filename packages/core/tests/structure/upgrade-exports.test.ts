/**
 * K3 of r18 and r19: the README's newest "Upgrading to" section lists exactly the exports the package
 * adds, removes or changes since the release it upgrades from, so it never promises an export that
 * is not there, nor leaves one out, nor hides a changed signature, and it names each member a type
 * the release's exports reach lost or made required. The release's exports, each with a hash of its
 * emitted declaration, the members of those types and the text of its API snapshots are checked in
 * (__snapshots__/released-exports.json), so the check needs no git, whose CI checkout is shallow and
 * has no tags; after a release, regenerate them from the tag with support/write-released-exports.ts.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ts } from "ts-morph"
import { describe, expect, it } from "vitest"
import { apiOf, type Exports, type Members } from "./support/exports-of.ts"

const ROOT = join(import.meta.dirname, "../..")
const RELEASED = JSON.parse(readFileSync(join(import.meta.dirname, "__snapshots__/released-exports.json"), "utf8")) as {
	exports: Exports
	inputs: string[]
	members: Members
	/** Each API snapshot file the release had, and its text */
	snapshots: Record<string, string>
	version: string
}
const README = readFileSync(join(ROOT, "../../README.md"), "utf8")

/** The newest "## Upgrading to X" section, and X */
function newestUpgrade(): { section: string; version: string } {
	const at = README.indexOf("\n## Upgrading to ")
	const next = README.indexOf("\n## ", at + 1)
	const section = README.slice(at, next === -1 ? undefined : next)
	return { section, version: /^\n## Upgrading to (\S+)/.exec(section)?.[1] as string }
}

/** Each name `to` has and `from` lacks, sorted, once */
const missingFrom = (from: Exports, to: Exports): string[] => {
	const names = Object.entries(to).flatMap(([subpath, each]) =>
		Object.keys(each).filter((name) => from[subpath]?.[name] === undefined),
	)
	return [...new Set(names)].sort()
}

/** Each name both have whose declaration differs, sorted, once */
const differing = (from: Exports, to: Exports): string[] => {
	const names = Object.entries(to).flatMap(([subpath, each]) =>
		Object.entries(each)
			.filter(([name, hash]) => (from[subpath]?.[name] ?? hash) !== hash)
			.map(([name]) => name),
	)
	return [...new Set(names)].sort()
}

/**
 * Each member of a type the release reached that the type still declared now lacks, or that was
 * optional there and is required now, as `Type.member`, sorted: a type no export reaches now is
 * the export lists' to name
 */
const narrowed = (from: Members, to: Members): string[] =>
	Object.entries(from)
		.flatMap(([type, members]) =>
			to[type] === undefined
				? []
				: Object.entries(members)
						.filter(([member, was]) => {
							const now = to[type]?.[member]
							return now === undefined || (was === "optional" && now === "required")
						})
						.map(([member]) => `${type}.${member}`),
		)
		.sort()

/**
 * Each member of a type a released callable took, which a consumer writes, that the type requires now
 * and lacked then, as `Type.member`, sorted: a type it returns may gain members freely (AD7-3 of the
 * area D round-seven review)
 */
const gained = (from: Members, to: Members, inputs: readonly string[]): string[] =>
	inputs
		.flatMap((type) =>
			from[type] === undefined
				? []
				: Object.entries(to[type] ?? {})
						.filter(([member, now]) => now === "required" && from[type]?.[member] === undefined)
						.map(([member]) => `${type}.${member}`),
		)
		.sort()

/** Each of `names`, as `Type.member`, that `section` does not name */
const unnamedIn = (section: string, names: readonly string[]): string[] =>
	names.filter((name) => !section.includes(`\`${name}\``))

/** Each member narrowed since the release, or gained as required by a type its callables took */
const changedMembers = (now: Members): string[] => [
	...narrowed(RELEASED.members, now),
	...gained(RELEASED.members, now, RELEASED.inputs),
]

const API = join(import.meta.dirname, "__snapshots__/api")

/** The snapshot's subpath: `index` is `.`, `a__b` is `./a/b` */
const subpathOf = (file: string): string =>
	file === "index.d.ts.txt" ? "." : `./${file.replace(/\.d\.ts\.txt$/, "").replaceAll("__", "/")}`

/** `type` without its parentheses, and without `| undefined` when that leaves one type */
function bare(type: ts.TypeNode | undefined): ts.TypeNode | undefined {
	if (type !== undefined && ts.isParenthesizedTypeNode(type)) return bare(type.type)
	if (type === undefined || !ts.isUnionTypeNode(type)) return type
	const defined = type.types.filter((each) => each.kind !== ts.SyntaxKind.UndefinedKeyword)
	return defined.length === 1 ? bare(defined[0]) : type
}

/** The members of an interface, a class or an object type alias, by its name */
function membersOf(node: ts.Node): [string, ts.NodeArray<ts.TypeElement | ts.ClassElement>] | undefined {
	if (ts.isInterfaceDeclaration(node)) return [node.name.text, node.members]
	if (ts.isClassDeclaration(node) && node.name !== undefined) return [node.name.text, node.members]
	if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) return [node.name.text, node.type.members]
	return undefined
}

/**
 * Each callable a snapshot declares, and whether it returns a promise: a function, a const or a type
 * of function type, and, as `Type.member` (D6-4 of the area D round-six review), a method or a
 * function-typed member of an interface, class or object type, a member typed by a callable alias among them
 */
function callablesOf(text: string): Map<string, boolean> {
	const found = new Map<string, boolean>()
	const mark = (name: string, promise: boolean) => found.set(name, found.get(name) === true || promise)
	const note = (name: string, type: ts.TypeNode | undefined) => mark(name, /^Promise\s*</.test(type?.getText() ?? ""))
	const noteMember = (name: string, member: ts.TypeElement | ts.ClassElement): void => {
		if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) return void note(name, member.type)
		const type = ts.isPropertySignature(member) || ts.isPropertyDeclaration(member) ? bare(member.type) : undefined
		if (type !== undefined && ts.isFunctionTypeNode(type)) note(name, type.type)
		const alias = type !== undefined && ts.isTypeReferenceNode(type) ? found.get(type.typeName.getText()) : undefined
		if (alias !== undefined) mark(name, alias)
	}
	const visit = (node: ts.Node): void => {
		if (ts.isFunctionDeclaration(node) && node.name !== undefined) note(node.name.text, node.type)
		if ((ts.isVariableDeclaration(node) || ts.isTypeAliasDeclaration(node)) && ts.isIdentifier(node.name)) {
			if (node.type !== undefined && ts.isFunctionTypeNode(node.type)) note(node.name.text, node.type.type)
		}
		ts.forEachChild(node, visit)
	}
	/* the members after every alias, which a snapshot may declare after the type that names it */
	const visitMembers = (node: ts.Node): void => {
		const [type, members] = membersOf(node) ?? ["", []]
		for (const member of members)
			if (member.name !== undefined && ts.isIdentifier(member.name)) noteMember(`${type}.${member.name.text}`, member)
		ts.forEachChild(node, visitMembers)
	}
	const source = ts.createSourceFile("snapshot.d.ts", text, ts.ScriptTarget.Latest, true)
	visit(source)
	visitMembers(source)
	return found
}

/** The snapshot `file` the release had, or nothing when it had no such subpath */
const releasedSnapshot = (file: string): string => RELEASED.snapshots[file] ?? ""

/** Each public callable the release exports that returned no promise there and returns one now, sorted, once */
function becamePromises(exports: Exports): string[] {
	const names = readdirSync(API).flatMap((file) => {
		const now = callablesOf(readFileSync(join(API, file), "utf8"))
		const then = callablesOf(releasedSnapshot(file))
		const exported = exports[subpathOf(file)] ?? {}
		/* a member counts when its type is exported: `CliIo.run` with `CliIo` */
		return [...then.keys()].filter(
			(name) =>
				exported[name.split(".")[0] as string] !== undefined && then.get(name) === false && now.get(name) === true,
		)
	})
	return [...new Set(names)].sort()
}

/** Whether `type`, past `readonly`, `| undefined` and parentheses, is `Run`, which 0.24 names `MigrateRun` */
const RUN_NAMES = new Set(["Run", "MigrateRun"])
const isRun = (type: ts.TypeNode | undefined): boolean => RUN_NAMES.has(bare(type)?.getText() ?? "")

/**
 * Each place a snapshot's declarations take a `Run`, which returns a promise since 0.21: a function's
 * parameter, as `fn(param)`, and a member of an interface, class or object type, as `Type.member`
 */
function runSitesOf(text: string): string[] {
	const sites: string[] = []
	const visit = (node: ts.Node): void => {
		if (ts.isFunctionDeclaration(node) && node.name !== undefined)
			for (const parameter of node.parameters)
				if (isRun(parameter.type)) sites.push(`${node.name.text}(${parameter.name.getText()})`)
		const [type, members] = membersOf(node) ?? ["", []]
		for (const member of members)
			if ((ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) && isRun(member.type))
				sites.push(`${type}.${member.name.getText()}`)
		ts.forEachChild(node, visit)
	}
	visit(ts.createSourceFile("snapshot.d.ts", text, ts.ScriptTarget.Latest, true))
	return sites
}

/** Each public place that takes a `Run`, whose function or type an export of its snapshot's subpath names, sorted, once */
function publicRunSites(exports: Exports): string[] {
	const sites = readdirSync(API).flatMap((file) => {
		const exported = exports[subpathOf(file)] ?? {}
		return runSitesOf(readFileSync(join(API, file), "utf8")).filter(
			(site) => exported[site.split(/[.(]/)[0] as string] !== undefined,
		)
	})
	return [...new Set(sites)].sort()
}

/**
 * The section's one paragraph opening "`a`, `b` … return a promise:", and that clause, up to its colon,
 * when it is `required`; otherwise the section holds none, as no paragraph may claim a change the
 * release did not make, and both are empty
 */
function promiseParagraph(section: string, required: boolean): { clause: string; paragraph: string } {
	const lines = [...section.matchAll(/^ *(`[^:\n]*? returns? a promise[^:\n]*):.*$/gm)]
	const expected = required
		? 'one "… return a promise:" sentence'
		: 'no "… return a promise:" sentence, as none became one'
	expect(lines, `${expected} in the section`).toHaveLength(required ? 1 : 0)
	return { clause: lines[0]?.[1] ?? "", paragraph: lines[0]?.[0] ?? "" }
}

/** The backticked names in the section's "`a`, `b` … return a promise:" clause, sorted; none when it needs none */
const promised = (section: string, required: boolean): string[] =>
	[...promiseParagraph(section, required).clause.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string).sort()

/**
 * What the newest section's async paragraph names since the release: each public callable, and member
 * of a public type, that returned no promise there and returns one now (`became`), and every public
 * place that takes a `Run` when `Run`, or a type or function taking one, changed since then while
 * something became a promise (`sites`, of `all` the places now): a rename changes every place's
 * declaration and makes nothing async, so it asks for no paragraph. The paragraph is required when
 * either names anything
 */
function asyncChange(now: Exports): { all: string[]; became: string[]; required: boolean; sites: string[] } {
	const became = becamePromises(RELEASED.exports)
	const changed = differing(RELEASED.exports, now)
	const all = publicRunSites(now)
	const touched =
		changed.some((name) => RUN_NAMES.has(name)) || all.some((site) => changed.includes(site.split(/[.(]/)[0] as string))
	const sites = touched && became.length > 0 ? all : []
	return { all, became, required: became.length > 0 || sites.length > 0, sites }
}

describe("the async paragraph an upgrade section holds", () => {
	const holding =
		"1. **Await each.** Two calls changed.\n\n   `f` and `g` return a promise: await each. **Fix:** await them."
	const none = "1. **Read less.** It reads less. **Fix:** none."

	it("is one, naming what became a promise, when one did, and absent when none did", () => {
		expect(promised(holding, true)).toEqual(["f", "g"])
		expect(() => promiseParagraph(none, true)).toThrow('one "… return a promise:" sentence')
		expect(() => promiseParagraph(holding, false)).toThrow('no "… return a promise:" sentence')
		expect(promiseParagraph(none, false)).toEqual({ clause: "", paragraph: "" })
	})
})

/** The backticked names on the section's one `label:` line, sorted; `none.` names none */
function listed(section: string, label: string): string[] {
	const lines = [...section.matchAll(new RegExp(`^ *${label}: (.+)$`, "gm"))]
	expect(lines, `one "${label}:" line in the section`).toHaveLength(1)
	const names = (lines[0]?.[1] ?? "").matchAll(/`([^`]+)`/g)
	return [...names].map((match) => match[1] as string).sort()
}

/* AD7-2 of the area D round-seven review: an unrelated `max` elsewhere in the section named IntegerConstraints.max */
describe("a changed member the section names", () => {
	it("is named only as `Type.member`, never by a bare member name the section holds elsewhere", () => {
		const section = "1. `T.min` is gone.\n2. Range queries take a `max` now."
		expect(unnamedIn(section, ["T.max", "T.min"])).toEqual(["T.max"])
	})
})

/* AD7-4 of the area D round-seven review: LruCache.clear made async passed, since no class member was read */
describe("the callables a snapshot declares", () => {
	it("hold a class's methods and function-typed properties as `Class.member`, as an interface's", () => {
		const text = [
			"export declare class Cache {",
			"\tprivate store;",
			"\tconstructor(size: number);",
			"\tclear(): Promise<void>;",
			"\tget(key: string): string | undefined;",
			"\tload: (key: string) => Promise<string>;",
			"\tsize: number;",
			"}",
		].join("\n")
		expect(Object.fromEntries(callablesOf(text))).toEqual({
			"Cache.clear": true,
			"Cache.get": false,
			"Cache.load": true,
		})
	})
})

describe("the members a type a released callable took gained as required (AD7-3)", () => {
	const from: Members = { Config: { name: "optional" }, Out: { x: "required" } }
	const to: Members = {
		Config: { banner: "required", name: "optional", note: "optional" },
		Out: { x: "required", y: "required" },
	}

	it("are named for an input type, and not for an output one or a type new since then", () => {
		expect(gained(from, { ...to, Fresh: { a: "required" } }, ["Config", "Fresh"])).toEqual(["Config.banner"])
	})
})

/** Whether `version` is the release the snapshot is checked in from: right after a release the newest section is the release's own, and the snapshot is regenerated from its tag */
function isReleased(version: string): boolean {
	const [major, minor] = version.split(".").map(Number)
	const [wasMajor, wasMinor] = RELEASED.version.split(".").map(Number)
	return major === wasMajor && minor === wasMinor
}

describe("the newest upgrade section's exports", () => {
	const api = apiOf(ROOT)
	const now = api.exports
	const { section, version } = newestUpgrade()

	const [major, minor] = version.split(".").map(Number)
	const [wasMajor, wasMinor] = RELEASED.version.split(".").map(Number)
	const released = isReleased(version)
	const since = {
		changed: differing(RELEASED.exports, now),
		new: missingFrom(RELEASED.exports, now),
		removed: missingFrom(now, RELEASED.exports),
	}

	it("upgrades from the release the exports are checked in from, or is that release's own", () => {
		expect(
			released || (major === wasMajor ? (minor as number) - (wasMinor as number) : 1) === 1,
			`Upgrading to ${version} from ${RELEASED.version}`,
		).toBe(true)
	})

	it("lists exactly what changed since then; nothing has, while the section is the release's own", () => {
		/* an export changed after the release opens the next version's section, which lists it */
		const lists = released
			? { changed: [], new: [], removed: [] }
			: {
					changed: listed(section, "Changed"),
					new: listed(section, "New exports"),
					removed: listed(section, "Removed"),
				}
		expect(lists, `changed since ${RELEASED.version}, against "Upgrading to ${version}"`).toEqual(since)
	})

	/* database-44's 0005 dropped `ManifestConfig.filePrefix`, which 0.20.1's generateManifest takes, and no list could name it */
	it("names each member a released type lost or made required, or a type a released callable took gained as required, since then", () => {
		const unnamed = unnamedIn(section, changedMembers(api.members))
		expect(
			released ? [] : unnamed,
			`members changed since ${RELEASED.version}, unnamed in "Upgrading to ${version}"`,
		).toEqual([])
	})

	/* D5-1 of the area D round-five review: the async paragraph left out exportDrizzleSchema and named a bare run;
	   p24: 0.22 made nothing async, and the paragraph 0.21's change required was demanded of it */
	it("names, in its async paragraph, exactly the public callables that return a promise since then, and holds none when none does", () => {
		const { became, required } = asyncChange(now)
		const callables = became.filter((name) => !name.includes("."))
		expect(released ? [] : promised(section, required), `became promises since ${RELEASED.version}`).toEqual(callables)
	})

	/* D6-4 of the area D round-six review: a runner an embedder passes, `CliIo.run`, became async too; the released
	   snapshot holds that promise since 0.21.0, so only the naming is guarded */
	it("names in that paragraph each member of a public type that returns a promise since then", () => {
		const { became, required } = asyncChange(now)
		const paragraph = released ? "" : promiseParagraph(section, required).paragraph
		expect(became.filter((name) => name.includes(".") && !paragraph.includes(`\`${name}\``))).toEqual([])
	})
})

describe("the newest upgrade section's async paragraph", () => {
	const now = apiOf(ROOT).exports
	const { section, version } = newestUpgrade()
	const released = isReleased(version)

	/* G1-5 of the G1 read: the async paragraph named three of the six places a runner is passed */
	it("names in that paragraph each public place that takes a `Run`, when `Run` or a place taking one changed since then", () => {
		const { all, required, sites } = asyncChange(now)
		expect(all).toContain("CliIo.run")
		const paragraph = released ? "" : promiseParagraph(section, required).paragraph
		expect(released ? [] : sites.filter((site) => !paragraph.includes(`\`${site}\``))).toEqual([])
	})
})
