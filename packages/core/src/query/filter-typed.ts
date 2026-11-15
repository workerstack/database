/* A filter value typed as its field declares: the number, date and boolean rules validateFilter holds each value to */
import { isoInstant } from "./iso-date.ts"
import type { FieldType, FilterCondition, FilterOperator } from "./types.ts"

/** A value typed as its field declares, or why it cannot be */
type Typed = { value: unknown } | { error: string }

const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/
const INTEGER = /^-?\d+$/
/* the least normal double, 2^-1022: below it a value reads as a subnormal or 0 */
const MIN_NORMAL = 2 ** -1022
/* the widest instant a JS Date holds, in epoch milliseconds either way */
const MAX_EPOCH_MS = 8.64e15

/**
 * A number field's value: finite (1e999 reads as Infinity, which no column holds), 0 or normal
 * (1e-400 reads as 0, which would match the rows holding 0), and within
 * ±(2^53 − 1), past which a double binds a neighbouring value, and no finer than a double holds it
 * (`1.000000000000000001` would bind as 1). The value is read, not its spelling:
 * `9007199254740993.0` and `9.007199254740993e15` are the same unsafe integer.
 */
function parseFilterNumber(raw: string):
	| {
			/** the number `raw` names */
			value: number
	  }
	| {
			/** why `raw` is no number a filter takes */
			error: string
	  } {
	const value = Number(raw)
	if (!NUMBER.test(raw) || !Number.isFinite(value)) return { error: `expects a number, got '${raw}'` }
	if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
		return { error: `expects a number within ±${Number.MAX_SAFE_INTEGER}, got '${raw}'` }
	}
	/* nonzero digits that read as 0 or a subnormal would bind a neighbouring value */
	const nonzero = /[1-9]/.test(raw.split(/[eE]/)[0] as string)
	if (nonzero && Math.abs(value) < MIN_NORMAL) {
		return { error: `expects a number of magnitude 0 or at least ${MIN_NORMAL}, got '${raw}'` }
	}
	/* digits past the ones a double holds would bind the double beside them: 1.000000000000000001 as 1 */
	if (decimalOf(raw) !== decimalOf(String(value))) {
		return { error: `expects a number a double holds as written, got '${raw}', which binds as ${value}` }
	}
	return { value }
}

/**
 * The decimal `text` writes, however spelled: its sign, its digits without leading or trailing zeros,
 * and the power of ten of the last one, so `1.50`, `15e-1` and `1.5` are one decimal
 */
function decimalOf(text: string): string {
	const [mantissa = "", exponent = "0"] = text.toLowerCase().split("e")
	const [whole = "", fraction = ""] = mantissa.replace(/^-/, "").split(".")
	const digits = `${whole}${fraction}`.replace(/^0+/, "")
	if (digits === "") return "0"
	const significant = digits.replace(/0+$/, "")
	const power = Number(exponent) - fraction.length + digits.length - significant.length
	return `${mantissa.startsWith("-") ? "-" : ""}${significant}e${power}`
}

/**
 * An ISO date field's value: the instant it names, or why it names none.
 * One its offset moves out of the years 0000 to 9999 is refused: its text would be
 * toISOString's expanded form, which no stored ISO text sorts beside
 */
function typedIsoDate(raw: string): Typed {
	const value = isoInstant(raw)
	if (value === undefined) return { error: `expects an ISO 8601 date or date-time, got '${raw}'` }
	const year = new Date(value.ms).getUTCFullYear()
	return year < 0 || year > 9999 ? { error: `expects an instant in the years 0000 to 9999, got '${raw}'` } : { value }
}

/** A date field's value: epoch milliseconds a JS Date holds */
function typedDate(raw: string): Typed {
	if (!INTEGER.test(raw)) return { error: `expects epoch milliseconds, got '${raw}'` }
	if (Math.abs(Number(raw)) > MAX_EPOCH_MS)
		return { error: `expects epoch milliseconds within ±${MAX_EPOCH_MS}, got '${raw}'` }
	return { value: Number(raw) }
}

/** One scalar of a `type` field, as the request wrote it */
function typedScalar({ format, type }: CheckedField, raw: string): Typed {
	switch (type) {
		case "number":
			return parseFilterNumber(raw)
		case "date":
			return format === "iso" ? typedIsoDate(raw) : typedDate(raw)
		case "boolean":
			return raw === "true" || raw === "false"
				? { value: raw === "true" }
				: { error: `expects true or false, got '${raw}'` }
		default:
			return { value: raw }
	}
}

/** `is` takes null and notnull on every field, true and false on a boolean one */
function typedIs(type: FieldType, raw: unknown): Typed {
	if (raw === null) return { value: null }
	const keyword = String(raw).toLowerCase()
	if (keyword === "notnull") return { value: "notnull" }
	if (type === "boolean" && (keyword === "true" || keyword === "false")) return { value: keyword === "true" }
	return { error: `is takes ${type === "boolean" ? "null, notnull, true or false" : "null or notnull"}, got '${raw}'` }
}

function typedValue(field: CheckedField, { operator, value }: FilterCondition): Typed {
	if (operator === "is") return typedIs(field.type, value)
	const lists = operator === "in" || operator === "nin"
	if (lists && !Array.isArray(value)) return { error: "in and nin take a list, as in.(a,b)" }
	if (!Array.isArray(value)) return typedScalar(field, String(value))
	const items = value.map((item) => typedScalar(field, String(item)))
	const failed = items.find((item) => "error" in item)
	return failed ?? { value: items.map((item) => (item as { value: unknown }).value) }
}

/** A field of the map with its operators resolved */
type CheckedField = { format: "iso" | undefined; operators: readonly FilterOperator[]; type: FieldType }

export { parseFilterNumber, typedValue, type CheckedField }
