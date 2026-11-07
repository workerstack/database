/**
 * A column's `format` checked against its helper and its other keys: a format sets a text's
 * pattern, case, trim and length and an integer's range, so a transform or a bound it already
 * holds beside it is a second rule a reader of the tables file believes; an enum's values are
 * checked against it here, at codegen, since the DTO is the enum itself.
 */
import {
	FORMATS,
	formatTakes,
	INTEGER_FORMATS,
	INTEGER_SPECS,
	type IntegerFormat,
	TEXT_FORMATS,
	type TextFormat,
} from "../formats/catalog.ts"
import type { CombColumnKind } from "../meta/column.ts"
import type { ConstantValue } from "./analyzer-types.ts"

/* the transforms a text declares, each of which a format sets itself */
const TRANSFORMS = ["lowercase", "trim", "uppercase"] as const

/** A bound's side, as a format's range names it in an error */
type Side = "max" | "min"

/** Whether `value` is one of `ids` */
const isOneOf = <F extends string>(ids: readonly F[], value: ConstantValue): value is F =>
	(ids as readonly ConstantValue[]).includes(value)

/** A format's id as an error names it, with the article it is read with: "an iso4217", "a bcp47" */
const anId = (format: TextFormat): string => `${/^(?:[aeio]|rfc|srgb)/.test(format) ? "an" : "a"} ${format}`

/** A text format's length on one side, as an error names it: its fixed length, else that side's */
function lengthOf(format: TextFormat, side: Side): string {
	const { max, min } = FORMATS[format]
	return min === max ? `length ${min}` : `${side} length ${side === "max" ? max : min}`
}

/**
 * Refuses a declared bound the format's range already holds, or one that leaves no value in it;
 * `named` is the range's side as an error reads it
 */
function refuseBounds(
	constraints: Readonly<Record<string, ConstantValue>>,
	{ least, most, named, place }: { least: number; most: number | null; named: (side: Side) => string; place: string },
): void {
	const { max, min } = constraints
	if (typeof max === "number" && most !== null && max > most)
		throw new Error(`${place}: max ${max} is past ${named("max")}: the format holds it`)
	if (typeof max === "number" && max < least)
		throw new Error(`${place}: max ${max} is below ${named("min")}: no value is both`)
	if (typeof min === "number" && most !== null && min > most)
		throw new Error(`${place}: min ${min} is past ${named("max")}: no value is both`)
	if (typeof min === "number" && min < least)
		throw new Error(`${place}: min ${min} is below ${named("min")}: the format holds it`)
}

/** Refuses the first of an enum's values its format does not take as written, naming the standard's form where the format's transforms reach it */
function refuseEnumValues(format: TextFormat, { place, values }: { place: string; values: readonly string[] }): void {
	const { transform } = FORMATS[format]
	const value = values.find((each) => !formatTakes(format, each))
	if (value === undefined) return
	const written = transform.reduce(
		(each, step) => (step === "trim" ? each.trim() : step === "lowercase" ? each.toLowerCase() : each.toUpperCase()),
		value,
	)
	const hint = formatTakes(format, written) ? `; write the standard's form, ${JSON.stringify(written)}` : ""
	throw new Error(`${place}: ${JSON.stringify(value)} is no ${format} value${hint}`)
}

/** Refuses what a text format already sets: a declared transform, or a length bound outside its range */
function refuseTextKeys(format: TextFormat, constraints: Readonly<Record<string, ConstantValue>>, place: string): void {
	const transform = TRANSFORMS.find((each) => constraints[each] === true)
	if (transform !== undefined)
		throw new Error(`${place}: ${anId(format)} text takes no ${transform}: the format sets its case and trim`)
	const { max, min } = FORMATS[format]
	refuseBounds(constraints, { least: min, most: max, named: (side) => `${format}'s ${lengthOf(format, side)}`, place })
}

/**
 * The format a column declares, checked against its helper: an id the helper's kind knows (an
 * integer format on c.integer, a text format on c.text and c.enum), no transform or bound the
 * format already sets or that leaves it no value, and every c.enum value one the format takes as
 * written. Null when none is declared; an error at `place` otherwise. The helper key check refuses a
 * format on any other helper first, and a text's kind check one beside a kind
 */
export function formatOf(
	constraints: Readonly<Record<string, ConstantValue>>,
	{ helper, place, values }: { helper: CombColumnKind | null; place: string; values: readonly string[] | null },
): IntegerFormat | TextFormat | null {
	const format = constraints["format"]
	if (format === undefined) return null
	const integer = helper === "integer"
	if (integer ? !isOneOf(INTEGER_FORMATS, format) : !isOneOf(TEXT_FORMATS, format)) {
		const known = isOneOf(TEXT_FORMATS, format) || isOneOf(INTEGER_FORMATS, format)
		const ids = integer ? `integer formats: ${INTEGER_FORMATS.join(", ")}` : `text formats: ${TEXT_FORMATS.join(", ")}`
		throw new Error(
			`${place}: ${known ? `c.${helper} takes no format` : "comb knows no format"} ${JSON.stringify(format)}; ${ids}`,
		)
	}
	if (isOneOf(INTEGER_FORMATS, format)) {
		const { max, min } = INTEGER_SPECS[format]
		refuseBounds(constraints, {
			least: min,
			most: max,
			named: (side) => `${format}'s ${side === "max" ? max : min}`,
			place,
		})
		return format
	}
	const text = format as TextFormat
	if (helper === "enum") refuseEnumValues(text, { place, values: values ?? [] })
	else refuseTextKeys(text, constraints, place)
	return text
}
