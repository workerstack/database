/** The range a number column holds and the bounds a written one takes, which the DTO checks and the manifest states. */
import type { FieldMeta } from "../../analyzer-types.ts"
import type { FieldConstraints } from "../../annotations.ts"
import { INTEGER_SPECS, type IntegerFormat } from "../../../formats/catalog.ts"
import type { Build } from "./build-types.ts"

/* Postgres stores c.integer in int4 */
const INT4 = { max: 2147483647, min: -2147483648 }

// lookup-table: the c helpers whose values are numbers or booleans, which numberBase types
const NUMBER_KINDS: ReadonlySet<string> = /* @__PURE__ */ new Set([
	"boolean",
	"createdAt",
	"deletedAt",
	"integer",
	"real",
	"serialId",
	"timestamp",
	"updatedAt",
])

/** Whether a column holds numbers: a database number helper, or a drizzle column whose data type is one */
export const isNumeric = (field: FieldMeta): boolean =>
	field.databaseKind === null ? field.dataType.startsWith("number") : NUMBER_KINDS.has(field.databaseKind)

/** Whether a number column holds integers: c.integer, c.serialId, or a drizzle integer type */
export const isInteger = (field: FieldMeta): boolean =>
	field.databaseKind === null
		? field.dataType.startsWith("number int")
		: field.databaseKind === "integer" || field.databaseKind === "serialId"

/* the integer range each column holds: Postgres's int2 and int4, else a JS number's exact range */
const INT2 = { max: 32767, min: -32768 }
export type Range = { max: number; min: number }

export const SAFE: Range = { max: Number.MAX_SAFE_INTEGER, min: Number.MIN_SAFE_INTEGER }

/** A bound as generated code writes it, a JS number's exact range by its name */
export const boundCode = (bound: number): string =>
	bound === SAFE.max
		? "globalThis.Number.MAX_SAFE_INTEGER"
		: bound === SAFE.min
			? "globalThis.Number.MIN_SAFE_INTEGER"
			: String(bound)

/** The range an integer column holds, by what the dialect stores it in */
export function integerRange(field: FieldMeta, dialect: Build["dialect"]): Range {
	if (dialect === "sqlite") return SAFE
	if (field.databaseKind === "integer" || field.databaseKind === "serialId" || field.dataType === "number int32")
		return INT4
	return field.dataType === "number int16" ? INT2 : SAFE
}

/** Whether `format` is an integer format's id, which an integer column's format always is: codegen refused any other */
const isIntegerFormat = (format: FieldConstraints["format"]): format is IntegerFormat =>
	format !== null && Object.hasOwn(INTEGER_SPECS, format)

/**
 * The bounds a written number is declared to: its own, joined with its integer format's range, the
 * tighter of each pair winning
 */
export function declaredBounds({ format, max, min }: FieldConstraints): { max: number | null; min: number | null } {
	if (!isIntegerFormat(format)) return { max, min }
	const spec = INTEGER_SPECS[format]
	return {
		max: max === null ? spec.max : Math.min(max, spec.max),
		min: min === null ? spec.min : Math.max(min, spec.min),
	}
}

/** A declared bound clamped to the column's, the column's where none is declared */
export const clamp = (declared: number | null, bound: number, pick: (a: number, b: number) => number): number =>
	declared === null ? bound : pick(declared, bound)

/** Refuses an integer's bounds, clamped to what the column holds, that leave no integer: every write would be refused */
export function refuseNoInteger(name: string, annotations: FieldConstraints, range: Range): void {
	const declared = declaredBounds(annotations)
	const min = clamp(declared.min, range.min, Math.max)
	const max = clamp(declared.max, range.max, Math.min)
	if (Math.ceil(min) > Math.floor(max))
		throw new Error(`${name}: its bounds min ${min} and max ${max} leave no integer the column holds; widen them`)
}

/**
 * The bounds a written number of `field` takes, as numberBase checks them: an integer's
 * and a timestamp's declared bounds clamped to what the column holds, a float's as declared, and
 * none on a boolean or a timestamp database fills
 */
export function numberRules(field: FieldMeta, dialect: Build["dialect"]): { max: number | null; min: number | null } {
	const { max, min } = declaredBounds(field.constraints)
	const kind = field.databaseKind
	if (kind === "boolean" || kind === "createdAt" || kind === "updatedAt" || kind === "deletedAt")
		return { max: null, min: null }
	const range = kind === "timestamp" ? SAFE : isInteger(field) ? integerRange(field, dialect) : undefined
	if (range === undefined) return { max, min }
	return { max: clamp(max, range.max, Math.min), min: clamp(min, range.min, Math.max) }
}
