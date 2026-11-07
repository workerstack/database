#!/usr/bin/env bun
// `bun scripts/registries.ts`: fetch the pinned release of each registry comb's text formats check, and write the
// modules that hold them under packages/core/src/formats/. The releases are the constants below and every list is
// sorted, so a rerun writes the same bytes; when a source releases, raise its constant, rerun, and review the diff of
// the five modules. A source whose shape changed fails here, by name, rather than writing a short list.
import { mkdirSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"

const TZDATA = "2026f"
const CLDR = "release-49"
const ISO_CODES = "v4.20.1"
/* the SIX list has no versioned URL: its Pblshd date is the release, so a newer list stops the run until this is raised */
const SIX_PUBLISHED = "2026-09-17"

const URLS = {
	tzdata: `https://data.iana.org/time-zones/releases/tzdata${TZDATA}.tar.gz`,
	six: "https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml",
	isoCodes: (file: string) => `https://salsa.debian.org/iso-codes-team/iso-codes/-/raw/${ISO_CODES}/data/${file}`,
	cldr: (file: string) => `https://raw.githubusercontent.com/unicode-org/cldr/${CLDR}/common/bcp47/${file}`,
}

/* the tzdata files whose Zone and Link lines name the zones: the main data and the backward links (UTC, US/Pacific).
 * factory holds only Factory, a placeholder, and backzone only pre-1970 history for names these already carry. */
const TZ_FILES = [
	"africa",
	"antarctica",
	"asia",
	"australasia",
	"europe",
	"northamerica",
	"southamerica",
	"etcetera",
	"backward",
]

/* each value's shape, held to the format source that checks it before its registry does, so no listed value is one
 * that source refuses */
const SHAPES = {
	alpha2: /^[A-Z]{2}$/u,
	alpha3: /^[A-Z]{3}$/u,
	language: /^[a-z]{2}$/u,
	zone: /^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+){0,2}$/u,
	/* a BCP 47 Unicode extension type: subtags of 3 to 8 lowercase alphanumerics */
	type: /^[a-z0-9]{3,8}(?:-[a-z0-9]{3,8})*$/u,
}
const ZONE_MAX = 64
/* the width a wrapped line of a registry literal stays within, below the formatter's 120 */
const WIDTH = 110
const OUT = new URL("../packages/core/src/formats/", import.meta.url)

async function fetchBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
	return new Uint8Array(await response.arrayBuffer())
}

const fetchText = async (url: string): Promise<string> => new TextDecoder().decode(await fetchBytes(url))

/** The regular files of a ustar archive, by name. */
function untar(archive: Uint8Array): Map<string, string> {
	const decoder = new TextDecoder()
	const field = (at: number, length: number) => decoder.decode(archive.subarray(at, at + length)).replace(/\0.*$/su, "")
	const files = new Map<string, string>()
	let at = 0
	while (at + 512 <= archive.length && archive[at] !== 0) {
		const size = Number.parseInt(field(at + 124, 12).trim(), 8)
		const type = field(at + 156, 1)
		const prefix = field(at + 345, 155)
		const name = prefix === "" ? field(at, 100) : `${prefix}/${field(at, 100)}`
		if (type === "0" || type === "") files.set(name, decoder.decode(archive.subarray(at + 512, at + 512 + size)))
		at += 512 + Math.ceil(size / 512) * 512
	}
	return files
}

/** Every Zone and Link name of the files named, Factory dropped; a line of any other form fails the run. */
function zoneNames(files: Map<string, string>): string[] {
	const version = files.get("version")?.trim()
	if (version !== TZDATA) throw new Error(`tzdata: the archive's version is ${version}, not ${TZDATA}`)
	const names = new Set<string>()
	for (const file of TZ_FILES) {
		const text = files.get(file)
		if (text === undefined) throw new Error(`tzdata ${TZDATA}: no file ${file}`)
		for (const line of text.split("\n")) {
			const fields = line.replace(/#.*$/u, "").trim().split(/\s+/u)
			const [keyword] = fields
			if (keyword === "Zone") names.add(fields[1] ?? "")
			else if (keyword === "Link") names.add(fields[2] ?? "")
			/* a Rule, a Zone's continuation (it opens with a UT offset) or a blank line names nothing */
			else if (keyword !== "Rule" && keyword !== "" && !/^-?[0-9]/u.test(keyword ?? ""))
				throw new Error(`tzdata ${TZDATA} ${file}: a line of no known form: ${line}`)
		}
	}
	names.delete("Factory")
	return held([...names], "tzdata zone", (name) => SHAPES.zone.test(name) && name.length <= ZONE_MAX)
}

/** The distinct alphabetic codes of the SIX ISO 4217 list one, asserted to be the pinned publication. */
function currencyCodes(xml: string): string[] {
	const published = /<ISO_4217 Pblshd="([^"]*)"/u.exec(xml)?.[1]
	if (published !== SIX_PUBLISHED)
		throw new Error(
			`SIX list one: published ${published}, not ${SIX_PUBLISHED}; raise SIX_PUBLISHED and review the diff`,
		)
	const codes = [...xml.matchAll(/<Ccy>([^<]*)<\/Ccy>/gu)].map((match) => match[1] ?? "")
	return held([...new Set(codes)], "ISO 4217 code", (code) => SHAPES.alpha3.test(code))
}

type IsoCodesEntry = { readonly alpha_2?: string; readonly alpha_3?: string }

function isoCodesEntries(json: string, key: string): readonly IsoCodesEntry[] {
	const entries: unknown = (JSON.parse(json) as Record<string, unknown>)[key]
	if (!Array.isArray(entries)) throw new Error(`iso-codes ${ISO_CODES}: no "${key}" list`)
	return entries as IsoCodesEntry[]
}

/** The values of one key of a CLDR bcp47 file, deprecated ones dropped. */
function cldrTypes(xml: string, key: string): string[] {
	const block = new RegExp(`<key name="${key}"[^>]*>([\\s\\S]*?)</key>`, "u").exec(xml)?.[1]
	if (block === undefined) throw new Error(`CLDR ${CLDR}: no key ${key}`)
	const types = [...block.matchAll(/<type((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/gu)].map((match) => {
		const attributes = new Map([...(match[1] ?? "").matchAll(/([\w:-]+)="([^"]*)"/gu)].map((a) => [a[1], a[2]]))
		return { name: attributes.get("name") ?? "", deprecated: attributes.get("deprecated") === "true" }
	})
	const current = types.filter((type) => !type.deprecated).map((type) => type.name)
	return held(current, `CLDR ${key} value`, (name) => SHAPES.type.test(name))
}

/** The values sorted by code unit, after asserting each holds its shape, none repeats and the list is not empty. */
function held(values: string[], what: string, holds: (value: string) => boolean): string[] {
	const wrong = values.filter((value) => !holds(value))
	if (wrong.length > 0)
		throw new Error(`${what}: ${wrong.map((value) => JSON.stringify(value)).join(", ")} breaks its shape`)
	if (values.length === 0) throw new Error(`${what}: the source lists none`)
	if (new Set(values).size !== values.length) throw new Error(`${what}: a value repeats`)
	return values.toSorted()
}

/** The values as lines of at most WIDTH, a new line starting wherever the group changes, separated by one space. */
function lines(values: readonly string[], groupOf: (value: string) => string): string {
	const out: string[] = []
	let current = ""
	let group: string | null = null
	for (const value of values) {
		const next = current === "" ? value : `${current} ${value}`
		if (groupOf(value) === group && next.length <= WIDTH) current = next
		else {
			if (current !== "") out.push(current)
			current = value
		}
		group = groupOf(value)
	}
	out.push(current)
	return out.join("\n")
}

type Registry = {
	readonly constant: string
	readonly why: string
	readonly values: readonly string[]
	readonly groupOf: (value: string) => string
}

/* the literal holds one space or one newline between values and none around them, so a split on each whitespace
 * character yields exactly the values */
function setOf({ constant, why, values, groupOf }: Registry): string {
	return `// lookup-table: ${why}
const ${constant}: ReadonlySet<string> = /* @__PURE__ */ new Set(
	/* @__PURE__ */ \`${lines(values, groupOf)}\`.split(/\\s/u),
)
`
}

type Predicate = { readonly name: string; readonly doc: readonly string[]; readonly constant: string }

const predicateOf = ({ name, doc, constant }: Predicate): string => `/**
${doc.map((line) => ` * ${line}`).join("\n")}
 */
export function ${name}(value: string): boolean {
	return ${constant}.has(value)
}
`

const header = (source: readonly string[]): string =>
	[
		"// Written by `bun scripts/registries.ts` from the pinned release below: edit the script, not this file.",
		...source.map((line) => `// ${line}`),
		"",
		"",
	].join("\n")

/* an array the formatter keeps on one line when it fits its 120 columns, and otherwise writes one value per line */
function arrayOf(constant: string, values: readonly string[]): string {
	const head = `export const ${constant}: readonly string[] = [`
	const inline = `${head}${values.map((value) => JSON.stringify(value)).join(", ")}]`
	if (inline.length <= 120) return inline
	return `${head}\n${values.map((value) => `\t${JSON.stringify(value)},`).join("\n")}\n]`
}

const firstLetter = (value: string): string => value.slice(0, 1)
const area = (name: string): string => (name.includes("/") ? name.slice(0, name.indexOf("/")) : "")

async function tzModule(): Promise<string> {
	const names = zoneNames(untar(gunzipSync(await fetchBytes(URLS.tzdata))))
	return `${header([`IANA tzdata ${TZDATA}: ${URLS.tzdata}`, `every Zone and Link name of ${TZ_FILES.join(", ")}; Factory dropped`])}${setOf(
		{
			constant: "NAMES",
			why: `the ${names.length} time zone names of tzdata ${TZDATA}, one line per area, read by isIanaTimeZone`,
			values: names,
			groupOf: area,
		},
	)}
${predicateOf({
	name: "isIanaTimeZone",
	constant: "NAMES",
	doc: [
		`Whether \`value\` names a time zone of IANA tzdata ${TZDATA}, exactly as written: a zone or a link to one, such as`,
		"Europe/Zagreb, America/Argentina/Buenos_Aires, Etc/GMT+5, UTC or US/Pacific. Case counts, and Factory, a",
		"placeholder, is no zone. Any string is taken; this never throws.",
	],
})}`
}

async function currencyModule(): Promise<string> {
	const codes = currencyCodes(await fetchText(URLS.six))
	return `${header([`ISO 4217 list one as SIX published it on ${SIX_PUBLISHED}: ${URLS.six}`, "the distinct alphabetic codes"])}${setOf(
		{
			constant: "CODES",
			why: `the ${codes.length} alphabetic codes of the ${SIX_PUBLISHED} list, one line per first letter, read by isIso4217`,
			values: codes,
			groupOf: firstLetter,
		},
	)}
${predicateOf({
	name: "isIso4217",
	constant: "CODES",
	doc: [
		`Whether \`value\` is a current ISO 4217 alphabetic currency code, exactly as written: uppercase, such as EUR or USD.`,
		`The codes are those of the list published ${SIX_PUBLISHED}, fund and precious metal codes such as XAU included;`,
		"a withdrawn code such as HRK is not one. Any string is taken; this never throws.",
	],
})}`
}

async function countryModule(): Promise<string> {
	const entries = isoCodesEntries(await fetchText(URLS.isoCodes("iso_3166-1.json")), "3166-1")
	const alpha2 = held(
		entries.map((entry) => entry.alpha_2 ?? ""),
		"ISO 3166-1 alpha-2 code",
		(code) => SHAPES.alpha2.test(code),
	)
	const alpha3 = held(
		entries.map((entry) => entry.alpha_3 ?? ""),
		"ISO 3166-1 alpha-3 code",
		(code) => SHAPES.alpha3.test(code),
	)
	const set = (constant: string, codes: readonly string[], name: string) =>
		setOf({
			constant,
			why: `the ${codes.length} codes, one line per first letter, read by ${name}`,
			values: codes,
			groupOf: firstLetter,
		})
	const source = `Debian iso-codes ${ISO_CODES}: ${URLS.isoCodes("iso_3166-1.json")}`
	return `${header([source, "the alpha-2 and alpha-3 code of every officially assigned country"])}${set("ALPHA_2", alpha2, "isIso3166Alpha2")}
${set("ALPHA_3", alpha3, "isIso3166Alpha3")}
${predicateOf({
	name: "isIso3166Alpha2",
	constant: "ALPHA_2",
	doc: [
		"Whether `value` is an officially assigned ISO 3166-1 alpha-2 country code, exactly as written: uppercase, such as",
		`HR or GB (UK is reserved, not assigned). The codes are those of Debian iso-codes ${ISO_CODES}. Any string is taken;`,
		"this never throws.",
	],
})}
${predicateOf({
	name: "isIso3166Alpha3",
	constant: "ALPHA_3",
	doc: [
		"Whether `value` is an officially assigned ISO 3166-1 alpha-3 country code, exactly as written: uppercase, such as",
		`HRV or GBR. The codes are those of Debian iso-codes ${ISO_CODES}. Any string is taken; this never throws.`,
	],
})}`
}

async function languageModule(): Promise<string> {
	const entries = isoCodesEntries(await fetchText(URLS.isoCodes("iso_639-2.json")), "639-2")
	const codes = held(
		entries.flatMap((entry) => (entry.alpha_2 === undefined ? [] : [entry.alpha_2])),
		"ISO 639-1 code",
		(code) => SHAPES.language.test(code),
	)
	const source = `Debian iso-codes ${ISO_CODES}: ${URLS.isoCodes("iso_639-2.json")}`
	return `${header([source, "the two-letter code of every ISO 639-2 language that has one, which is ISO 639-1"])}${setOf(
		{
			constant: "CODES",
			why: `the ${codes.length} two-letter language codes, one line per first letter, read by isIso639Alpha2`,
			values: codes,
			groupOf: firstLetter,
		},
	)}
${predicateOf({
	name: "isIso639Alpha2",
	constant: "CODES",
	doc: [
		"Whether `value` is an ISO 639-1 two-letter language code, exactly as written: lowercase, such as hr or en. The",
		`codes are those of Debian iso-codes ${ISO_CODES}. Any string is taken; this never throws.`,
	],
})}`
}

/* each UTS #35 Unicode locale extension key a format takes: its file, its export and what its values are */
const UTS35_KEYS = [
	{ key: "ca", file: "calendar.xml", constant: "CALENDARS", what: "calendar" },
	{ key: "fw", file: "calendar.xml", constant: "FIRST_DAYS", what: "first day of the week" },
	{ key: "hc", file: "calendar.xml", constant: "HOUR_CYCLES", what: "hour cycle" },
	{ key: "ms", file: "measure.xml", constant: "MEASUREMENT_SYSTEMS", what: "measurement system" },
	{ key: "mu", file: "measure.xml", constant: "MEASUREMENT_UNITS", what: "temperature unit" },
	{ key: "nu", file: "number.xml", constant: "NUMBERING_SYSTEMS", what: "numbering system" },
] as const

async function uts35Module(): Promise<string> {
	const files = new Map<string, string>()
	for (const { file } of UTS35_KEYS) if (!files.has(file)) files.set(file, await fetchText(URLS.cldr(file)))
	const lists = UTS35_KEYS.map(({ key, file, constant, what }) => {
		const values = cldrTypes(files.get(file) ?? "", key)
		return `/** The ${values.length} values of the \`${key}\` (${what}) key of a Unicode locale extension, deprecated ones dropped. */\n${arrayOf(constant, values)}\n`
	})
	const sources = [...files.keys()].map((file) => URLS.cldr(file))
	return `${header([`Unicode CLDR ${CLDR}:`, ...sources.map((url) => `  ${url}`)])}${lists.join("\n")}`
}

const MODULES = [
	{ file: "iana-time-zone.ts", release: `tzdata ${TZDATA}`, write: tzModule },
	{ file: "iso3166-1.ts", release: `iso-codes ${ISO_CODES}`, write: countryModule },
	{ file: "iso4217.ts", release: `SIX list one ${SIX_PUBLISHED}`, write: currencyModule },
	{ file: "iso639-1.ts", release: `iso-codes ${ISO_CODES}`, write: languageModule },
	{ file: "uts35.ts", release: `CLDR ${CLDR}`, write: uts35Module },
]

mkdirSync(OUT, { recursive: true })
for (const { file, release, write } of MODULES) {
	const url = new URL(file, OUT)
	writeFileSync(url, await write())
	console.log(`wrote packages/core/src/formats/${file} (${release})`)
}
