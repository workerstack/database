/*
 * The standard formats a column declares with `format`: each id's standard, the source its DTO checks,
 * its length bounds, the transforms that run before the check, and the pinned registry a value must
 * also belong to. The DTO's failure is zod's `invalid_format` issue with the id and no message, so a
 * zod locale or error map translates it; the catalog carries no text a person reads but `standard`.
 */
import { ipv4Source, strictIpv6Source } from "../codegen/generators/dtos/ip-patterns.ts"
import { isIanaTimeZone } from "./iana-time-zone.ts"
import { isIso3166Alpha2, isIso3166Alpha3 } from "./iso3166-1.ts"
import { isIso4217 } from "./iso4217.ts"
import { isIso639Alpha2 } from "./iso639-1.ts"
import {
	CALENDARS,
	FIRST_DAYS,
	HOUR_CYCLES,
	MEASUREMENT_SYSTEMS,
	MEASUREMENT_UNITS,
	NUMBERING_SYSTEMS,
} from "./uts35.ts"

/** The ids `c.text` and `c.enum` take as `format`, sorted by code unit */
export const TEXT_FORMATS = [
	"base64url",
	"bcp47",
	"e164",
	"iana-time-zone",
	"ip",
	"ipv4",
	"ipv6",
	"iso3166-1-alpha-2",
	"iso3166-1-alpha-3",
	"iso4217",
	"iso639-1",
	"kebab-slug",
	"pkce-s256-challenge",
	"rfc1123-hostname",
	"semver",
	"sha256-hex",
	"sha512-hex",
	"srgb-hex",
	"srgb-hex-alpha",
	"ulid",
	"uts35-ca",
	"uts35-fw",
	"uts35-hc",
	"uts35-ms",
	"uts35-mu",
	"uts35-nu",
	"uuid",
	"uuid-v4",
	"uuid-v7",
] as const

/** The ids `c.integer` takes as `format`, sorted by code unit */
export const INTEGER_FORMATS = ["iso8601-month", "iso8601-weekday"] as const

/** A text format's id */
export type TextFormat = (typeof TEXT_FORMATS)[number]

/** An integer format's id */
export type IntegerFormat = (typeof INTEGER_FORMATS)[number]

/** The registry predicate a text format's value must also satisfy */
type Member = "isIanaTimeZone" | "isIso3166Alpha2" | "isIso3166Alpha3" | "isIso4217" | "isIso639Alpha2"

/** What a text format checks, after its transforms, on the value its DTO is given */
export type FormatSpec = {
	/** The standard and the release it follows, as a person reads it */
	readonly standard: string
	/** The anchored pattern the value matches, portable to RE2 and JavaScript's `u` flag */
	readonly source: string
	/** The fewest characters a value has */
	readonly min: number
	/** The most characters a value has, or null when the format sets no cap and a column declares one */
	readonly max: number | null
	/** The transforms that run, in order, before the check */
	readonly transform: readonly ("lowercase" | "trim" | "uppercase")[]
	/** The pinned registry the value must belong to, by its predicate's name, or null when the source is the whole rule */
	readonly member: Member | null
	/** A value of the format as written, which the format takes and a generated DTO publishes as its example */
	readonly example: string
}

/** The range an integer format's value lies in */
export type IntegerSpec = {
	/** The standard that numbers the values, as a person reads it */
	readonly standard: string
	/** The least value */
	readonly min: number
	/** The greatest value */
	readonly max: number
}

/** The transforms a format runs before its check: trim on all, then the one case its values are written in */
type Transforms = FormatSpec["transform"]
const TRIM: Transforms = ["trim"]
const LOWERCASE: Transforms = ["trim", "lowercase"]
const UPPERCASE: Transforms = ["trim", "uppercase"]

/*
 * RFC 5646 §2.1's langtag: language (with up to three extlangs), script, region, variants, extensions
 * and private use, each class case-insensitive; a grandfathered tag is no langtag
 */
const LANGUAGE = "(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{4,8})"
const VARIANTS = "(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*"
const EXTENSIONS = "(?:-[0-9A-WYZa-wyz](?:-[A-Za-z0-9]{2,8})+)*"
const LANGTAG = `${LANGUAGE}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?${VARIANTS}${EXTENSIONS}(?:-[Xx](?:-[A-Za-z0-9]{1,8})+)?`

/* semver.org 2.0.0's version pattern, its groups non-capturing */
const NUMBER = "(?:0|[1-9][0-9]*)"
const IDENTIFIER = "(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)"
const BUILD = "(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?"
const SEMVER = `${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-${IDENTIFIER}(?:\\.${IDENTIFIER})*)?${BUILD}`

const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
const HOSTNAME = `^${HOST_LABEL}(?:\\.${HOST_LABEL})*$`
const ZONE_NAME = "^[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+){0,2}$"
const HEX = "[0-9a-f]"
const BASE64URL = "[A-Za-z0-9_-]"
/* whole quads, then two or three characters: a length of 1 mod 4 encodes no byte string */
const UNPADDED = `^(?:${BASE64URL}{4})*(?:${BASE64URL}{2,3})?$`

/* the examples too long for their format's row, the digests of no bytes among them */
const PHONE = "+385911234567"
const ZONE = "Europe/Zagreb"
const IPV6 = "2001:db8::1"
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const RGBA = "#1e90ff80"
const ULID = "01hzy3k8q2m4n5p6r7s8t9v0wx"
const UUID_V7 = "01890a5d-ac96-774b-bcce-b302099a8057"
const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
const SHA512_EMPTY =
	"cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"
const UUID_V4 = "0f8fad5b-d9cb-469f-a165-70867728950e"

/* the standards whose names would widen a row past the line */
const COUNTRY_2 = "ISO 3166-1 alpha-2 country code, Debian iso-codes v4.20.1"
const COUNTRY_3 = "ISO 3166-1 alpha-3 country code, Debian iso-codes v4.20.1"
const CURRENCY = "ISO 4217 alphabetic currency code, SIX list 2026-09-17"
const LANGUAGE_CODE = "ISO 639-1 language code, Debian iso-codes v4.20.1"
const CHALLENGE = "RFC 7636 §4.2 PKCE SHA-256 code challenge"
const SLUG = "kebab-case slug, lowercase letters and digits joined by single hyphens"
const ADDRESS = "IPv4 dotted quad or IPv6 address, RFC 4291 §2.2"
const DIGEST_256 = "SHA-256 digest, FIPS 180-4, lowercase hex"
const DIGEST_512 = "SHA-512 digest, FIPS 180-4, lowercase hex"
const COLOR_ALPHA = "sRGB color with alpha as #rrggbbaa, CSS Color 4"

/** One row of the table: a spec's fields in the order a reader scans them */
type Row = readonly [
	standard: string,
	source: string,
	min: number,
	max: number | null,
	transform: Transforms,
	member: Member | null,
	example: string,
]

/** The spec a row states */
const spec = ([standard, source, min, max, transform, member, example]: Row): FormatSpec => ({
	example,
	max,
	member,
	min,
	source,
	standard,
	transform,
})

/** RFC 9562's 8-4-4-4-12 layout in lowercase hex, its version digit and variant digit given */
const uuid = (standard: string, [version, variant]: [string, string], example: string): FormatSpec =>
	spec([
		standard,
		`^${HEX}{8}-${HEX}{4}-${version}${HEX}{3}-${variant}${HEX}{3}-${HEX}{12}$`,
		36,
		36,
		LOWERCASE,
		null,
		example,
	])

/** A UTS #35 key's spec: an alternation of CLDR's values, the whole rule, bounded by the shortest and longest */
function uts35(key: string, values: readonly string[], example: string): FormatSpec {
	const lengths = values.map((value) => value.length)
	const standard = `UTS #35 ${key} key value, CLDR 49`
	const [min, max] = [Math.min(...lengths), Math.max(...lengths)]
	return spec([standard, `^(?:${values.join("|")})$`, min, max, LOWERCASE, null, example])
}

/** Every text format's spec, built in a function so importing the module runs nothing */
function specs(): { readonly [F in TextFormat]: FormatSpec } {
	const ipv4 = ipv4Source()
	const ipv6 = strictIpv6Source()
	return {
		base64url: spec(["RFC 4648 §5 base64url, unpadded", UNPADDED, 0, null, TRIM, null, "dGVzdA"]),
		/* RFC 5646 §4.4.1's 35 is the buffer an implementation must hold, not a cap on a tag */
		bcp47: spec(["BCP 47 language tag, RFC 5646 §2.1 well-formed", `^${LANGTAG}$`, 2, null, TRIM, null, "zh-Hant-TW"]),
		e164: spec(["ITU-T E.164 phone number, + and up to 15 digits", "^\\+[1-9][0-9]{1,14}$", 3, 16, TRIM, null, PHONE]),
		"iana-time-zone": spec(["IANA time zone name, tzdata 2026f", ZONE_NAME, 1, 64, TRIM, "isIanaTimeZone", ZONE]),
		ip: spec([ADDRESS, `^(?:${ipv4}|${ipv6})$`, 2, 45, LOWERCASE, null, IPV6]),
		ipv4: spec(["IPv4 address, dotted quad without leading zeros", `^${ipv4}$`, 7, 15, TRIM, null, "192.0.2.1"]),
		ipv6: spec(["IPv6 address, RFC 4291 §2.2", `^(?:${ipv6})$`, 2, 45, LOWERCASE, null, IPV6]),
		"iso3166-1-alpha-2": spec([COUNTRY_2, "^[A-Z]{2}$", 2, 2, UPPERCASE, "isIso3166Alpha2", "HR"]),
		"iso3166-1-alpha-3": spec([COUNTRY_3, "^[A-Z]{3}$", 3, 3, UPPERCASE, "isIso3166Alpha3", "HRV"]),
		iso4217: spec([CURRENCY, "^[A-Z]{3}$", 3, 3, UPPERCASE, "isIso4217", "EUR"]),
		"iso639-1": spec([LANGUAGE_CODE, "^[a-z]{2}$", 2, 2, LOWERCASE, "isIso639Alpha2", "hr"]),
		"kebab-slug": spec([SLUG, "^[a-z0-9]+(?:-[a-z0-9]+)*$", 1, 128, TRIM, null, "spring-sale-2026"]),
		"pkce-s256-challenge": spec([CHALLENGE, `^${BASE64URL}{43}$`, 43, 43, TRIM, null, PKCE_CHALLENGE]),
		"rfc1123-hostname": spec(["RFC 1123 §2.1 host name", HOSTNAME, 1, 253, LOWERCASE, null, "api.example.com"]),
		semver: spec(["Semantic Versioning 2.0.0 version", `^${SEMVER}$`, 5, 256, TRIM, null, "1.4.0-rc.1"]),
		"sha256-hex": spec([DIGEST_256, `^${HEX}{64}$`, 64, 64, LOWERCASE, null, SHA256_EMPTY]),
		"sha512-hex": spec([DIGEST_512, `^${HEX}{128}$`, 128, 128, LOWERCASE, null, SHA512_EMPTY]),
		"srgb-hex": spec(["sRGB color as #rrggbb, CSS Color 4", `^#${HEX}{6}$`, 7, 7, LOWERCASE, null, "#1e90ff"]),
		"srgb-hex-alpha": spec([COLOR_ALPHA, `^#${HEX}{8}$`, 9, 9, LOWERCASE, null, RGBA]),
		/* Crockford's base32 in lowercase, as generateUlid writes it; the first character holds 3 bits */
		ulid: spec(["ULID, Crockford base32 in lowercase", "^[0-7][0-9a-hjkmnp-tv-z]{25}$", 26, 26, LOWERCASE, null, ULID]),
		"uts35-ca": uts35("calendar (ca)", CALENDARS, "gregory"),
		"uts35-fw": uts35("first day of the week (fw)", FIRST_DAYS, "mon"),
		"uts35-hc": uts35("hour cycle (hc)", HOUR_CYCLES, "h23"),
		"uts35-ms": uts35("measurement system (ms)", MEASUREMENT_SYSTEMS, "metric"),
		"uts35-mu": uts35("measurement unit (mu)", MEASUREMENT_UNITS, "celsius"),
		"uts35-nu": uts35("numbering system (nu)", NUMBERING_SYSTEMS, "latn"),
		uuid: uuid("RFC 9562 UUID, lowercase hex", [HEX, HEX], UUID_V4),
		"uuid-v4": uuid("RFC 9562 UUID version 4, lowercase hex", ["4", "[89ab]"], UUID_V4),
		"uuid-v7": uuid("RFC 9562 UUID version 7, lowercase hex", ["7", "[89ab]"], UUID_V7),
	}
}

/** Every text format's spec, by id */
export const FORMATS: { readonly [F in TextFormat]: FormatSpec } = /* @__PURE__ */ specs()

/** Every integer format's range, by id */
export const INTEGER_SPECS: { readonly [F in IntegerFormat]: IntegerSpec } = {
	"iso8601-month": { max: 12, min: 1, standard: "ISO 8601 month number, 1 January to 12 December" },
	"iso8601-weekday": { max: 7, min: 1, standard: "ISO 8601 §3.2.2 weekday number, 1 Monday to 7 Sunday" },
}

const MEMBERS: { readonly [M in Member]: (value: string) => boolean } = {
	isIanaTimeZone,
	isIso3166Alpha2,
	isIso3166Alpha3,
	isIso4217,
	isIso639Alpha2,
}

/**
 * Whether `format` takes `value` exactly as written, its transforms not run: within the format's
 * length bounds, matching its source, and a member of its registry when it names one. Never throws.
 */
export function formatTakes(format: TextFormat, value: string): boolean {
	const { max, member, min, source } = FORMATS[format]
	if (value.length < min || (max !== null && value.length > max)) return false
	if (!new RegExp(source, "u").test(value)) return false
	return member === null || MEMBERS[member](value)
}
