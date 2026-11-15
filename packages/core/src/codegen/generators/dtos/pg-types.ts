/**
 * The rule a write DTO gives a plain Postgres column by its data type: what Postgres takes
 * for that type, as a zod check can say it, so a value the database would refuse is a 400 here
 * rather than a 22P02 from the insert. A rule is stricter than Postgres only for a spelling the
 * 0.14 changelog lists. A read DTO keeps the plain type, as a read never refuses a stored row.
 */
import type { FieldMeta } from "../../analyzer-types.ts"
import { inetRule } from "./ip-patterns.ts"
import { type IntervalField, ISO_DATE, intervalRule, timeRule, timestampRule } from "./pg-time-rules.ts"

/**
 * A Postgres type's modifier, parsed once from drizzle's `getSQLType()` so every rule reads the
 * same value and none matches the text: a time's precision (Postgres's 6 where none is declared) and zone, a
 * numeric's precision and signed scale (Postgres 15 takes a scale past the precision, or below 0),
 * an interval's last field and precision, a bit string's length
 */
export type PgModifier =
	| { base: "bit"; length: number }
	| { base: "interval"; field: IntervalField | null; precision: number | null }
	| { base: "numeric"; precision: number | null; scale: number }
	| { base: "time" | "timestamp"; precision: number; withTimeZone: boolean }
	| { base: "other" }

const INTERVAL_FIELDS =
	/^interval(?: (year|month|day|hour|minute|second)(?: to (month|hour|minute|second))?)?(?:\((\d+)\))?$/

/**
 * The digits after the second's point a time, timestamp or interval declared with no precision
 * keeps: Postgres's MAX_TIME_PRECISION, MAX_TIMESTAMP_PRECISION and MAX_INTERVAL_PRECISION, past
 * which it rounds, as a declared precision does (`23:59:59.9999995` into a plain time is `24:00:00`)
 */
const DEFAULT_PRECISION = 6

/** The modifier drizzle's SQL type `sqlType` declares; a type database reads none of is `other` */
export function pgModifierOf(sqlType: string): PgModifier {
	/* drizzle writes `timestamp (3)` in one mode and `timestamp(3)` in another */
	const time = /^(time|timestamp) ?(?:\((\d+)\))?( with time zone)?$/.exec(sqlType)
	if (time !== null)
		return {
			base: time[1] as "time" | "timestamp",
			precision: time[2] === undefined ? DEFAULT_PRECISION : Number(time[2]),
			withTimeZone: time[3] !== undefined,
		}
	const numeric = /^numeric(?:\((\d+)(?:, ?(-?\d+))?\))?$/.exec(sqlType)
	if (numeric !== null)
		return {
			base: "numeric",
			precision: numeric[1] === undefined ? null : Number(numeric[1]),
			scale: Number(numeric[2] ?? 0),
		}
	const interval = INTERVAL_FIELDS.exec(sqlType)
	if (interval !== null)
		return {
			base: "interval",
			field: (interval[2] ?? interval[1] ?? null) as IntervalField | null,
			precision: interval[3] === undefined ? null : Number(interval[3]),
		}
	const bit = /^bit\((\d+)\)$/.exec(sqlType)
	return bit === null ? { base: "other" } : { base: "bit", length: Number(bit[1]) }
}

/** The modifier of `sqlType`, which a rule keyed by its data type knows is of `base` */
function modifierAs<B extends PgModifier["base"]>(sqlType: string, base: B): Extract<PgModifier, { base: B }> {
	const modifier = pgModifierOf(sqlType)
	if (modifier.base !== base) throw new TypeError(`database reads no ${base} modifier in ${sqlType}`)
	return modifier as Extract<PgModifier, { base: B }>
}

/**
 * A numeric as text: its digits, within its precision and scale. Postgres rounds a
 * longer fraction first, which may carry it past the precision (999.995 into numeric(5,2) is a
 * 22003), so the DTO takes none. A scale past the precision leaves a fraction alone, its first
 * scale - precision digits zeros; a scale below 0 a whole number whose last -scale digits are zeros
 */
function numericText(sqlType: string): string {
	const { precision, scale } = modifierAs(sqlType, "numeric")
	if (precision === null) return "z.string().regex(/^-?[0-9]+(?:\\.[0-9]+)?$/u)"
	if (scale < 0)
		return `z.string().regex(/^-?0*(?:[0-9]{1,${precision}}0{${-scale}}|0)$/u, { message: "Must be a whole number of at most ${precision} digits then ${-scale} zeros, which numeric(${precision}, ${scale}) holds unrounded" })`
	if (scale > precision)
		return `z.string().regex(/^-?0+(?:\\.(?:0{1,${scale}}|0{${scale - precision}}[0-9]{1,${precision}}))?$/u, { message: "Must be a number below 10^${precision - scale} of at most ${scale} digits after the point" })`
	const whole = precision - scale === 0 ? "0" : `[0-9]{1,${precision - scale}}`
	const fraction = scale === 0 ? "" : `(?:\\.[0-9]{1,${scale}})?`
	return `z.string().regex(/^-?0*${whole}${fraction}$/u, { message: "Must be a number of at most ${precision - scale} digits before the point and ${scale} after it" })`
}

/**
 * A numeric read in drizzle's number mode: below 10^(precision - scale) in magnitude by at least
 * half its last place, so Postgres's rounding keeps it within the precision, whatever the scale's sign
 */
function numericNumber(sqlType: string): string | undefined {
	const { precision, scale } = modifierAs(sqlType, "numeric")
	if (precision === null) return undefined
	const bound = 10 ** (precision - scale) - 5 * 10 ** -(scale + 1)
	return `z.number().gt(${-bound}).lt(${bound})`
}

/** A digit string as long as `limit` and not above it: `limit` itself, or a smaller digit where the two first part */
function notAbove(limit: string): string {
	const below = [...limit].flatMap((digit, at) =>
		digit === "0" ? [] : [`${limit.slice(0, at)}[0-${Number(digit) - 1}][0-9]{${limit.length - at - 1}}`],
	)
	return [...below, limit].join("|")
}

/* a bigint in drizzle's string mode: decimal digits within int8's range, as one pattern a JSON
   Schema reader applies too: at most 18 significant digits, or 19 not past the bound */
const int64Text = (): string =>
	`z.string().regex(/^(?:0*(?:[0-9]{1,18}|${notAbove("9223372036854775807")})|-0*(?:[0-9]{1,18}|${notAbove("9223372036854775808")}))$/u, { message: "Must be a whole number within bigint's range, -2^63 to 2^63 - 1" })`

/*
 * float4 holds magnitudes up to 3.4028235e38, and refuses a value that rounds to zero: at or below
 * half its smallest subnormal, 2^-150 (1e-45 rounds up to 1.4e-45 and is taken; 1e-50 is not)
 */
const REAL =
	'z.number().min(-3.4028235e38).max(3.4028235e38).refine((val) => val === 0 || globalThis.Math.abs(val) > 7.006492321624085e-46, { message: "Must be zero or above 2^-150 in magnitude, which real would round to zero" }).meta({ not: { minimum: -7.006492321624085e-46, maximum: 7.006492321624085e-46, not: { const: 0 } } })'

/** The shared schema a cidr's rule is, which the entity file imports */
export const CIDR = "cidrSchema"

/*
 * The spellings Postgres takes for a MAC address. A macaddr: octets of one or two hex digits each,
 * all split by `:` or all by `-`; two halves of six digits; groups of four split by `.` or `-`; or
 * the digits bare. A macaddr8 reads two digits an octet, and one separator, `:`, `-` or `.`, at
 * any of the gaps between them or at none; it takes eight octets, or six, which it widens with ff:fe.
 * Its case is written into the classes and each separator is its own branch, as JSON
 * Schema publishes no flag and RE2 takes no backreference
 */
const HEX = "[0-9A-Fa-f]"
const OCTET = `${HEX}{1,2}`
const PAIR = `${HEX}{2}`
const QUAD = `${HEX}{4}`

/** `group`, then a separator and `group` again `rest` times: one branch per separator of `separators` */
const splitBy = (separators: string[], group: string, rest: string): string[] =>
	separators.map((separator) => `${group}(?:${separator}${group})${rest}`)

const macRegex = (message: string, branches: string[]): string =>
	`z.string().regex(/^(?:${branches.join("|")})$/u, { message: "${message}" })`

const macaddr = (): string =>
	macRegex("Must be a MAC address of six octets", [
		...splitBy([":", "-"], OCTET, "{5}"),
		`${HEX}{6}[:-]${HEX}{6}`,
		...splitBy(["\\.", "-"], QUAD, "{2}"),
		`${HEX}{12}`,
	])
const macaddr8 = (): string =>
	macRegex(
		"Must be a MAC address of six or eight octets",
		[":", "-", "\\."].map((separator) => `${PAIR}(?:${separator}?${PAIR}){5}(?:(?:${separator}?${PAIR}){2})?`),
	)

/** A bit(n) string, drizzle's bit always declaring n: exactly n bits, as an insert takes it (a cast pads or cuts) */
function bitString(sqlType: string): string {
	const { length } = modifierAs(sqlType, "bit")
	return `z.string().regex(/^[01]{${length}}$/u, { message: "Must be exactly ${length} bits" })`
}

/* each data type drizzle gives a Postgres column, and its rule */
// lookup-table: a data type's write rule
const RULES: Readonly<Record<string, (field: FieldMeta) => string | undefined>> = {
	number: ({ sqlType }) => numericNumber(sqlType),
	"number float": () => REAL,
	"string binary": ({ sqlType }) => bitString(sqlType),
	"string cidr": () => CIDR,
	"string date": () => `z.stringFormat("date", /^${ISO_DATE}$/u)`,
	/* an inet a host address, its netmask optional; a cidr the shared cidrSchema, which also refuses a bit set past its prefix length */
	"string inet": inetRule,
	"string interval": ({ intervalPrecision, sqlType }) => {
		const modifier = modifierAs(sqlType, "interval")
		return intervalRule({
			field: modifier.field,
			precision: intervalPrecision ?? modifier.precision ?? DEFAULT_PRECISION,
		})
	},
	"string macaddr": macaddr,
	"string macaddr8": macaddr8,
	"string int64": int64Text,
	"string numeric": ({ sqlType }) => numericText(sqlType),
	"string time": ({ sqlType }) => timeRule(modifierAs(sqlType, "time")),
	"string timestamp": ({ sqlType }) => timestampRule(modifierAs(sqlType, "timestamp")),
	/* the canonical spelling, as README says */
	"string uuid": () => "z.guid()",
}

/** The write rule of a plain Postgres column of `field`'s data type; undefined when the plain type is its rule */
export function pgWriteRule(field: FieldMeta): string | undefined {
	return Object.hasOwn(RULES, field.dataType)
		? (RULES[field.dataType] as (field: FieldMeta) => string | undefined)(field)
		: undefined
}
