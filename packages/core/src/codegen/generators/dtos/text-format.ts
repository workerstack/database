/**
 * A text column's standard format in its DTO: one check that pushes zod's `invalid_format` issue
 * with the format's id and no message, so zod's locale or the consumer's error map words it, and
 * the source and length bounds it holds the value to, published as the format's own. Every format
 * is read from the catalog's spec map alone.
 */
import type { FieldConstraints } from "../../annotations.ts"
import { FORMATS, type FormatSpec, type TextFormat } from "../../../formats/catalog.ts"
import { regexExpression } from "../../utils/pattern.ts"
import { metaOf } from "./build-types.ts"

/** A declared text format: its id beside its spec */
export type DeclaredFormat = { id: TextFormat; spec: FormatSpec }

/** Whether `format` is a text format's id, which a text column's format always is: codegen refused any other */
const isTextFormat = (format: FieldConstraints["format"]): format is TextFormat =>
	format !== null && Object.hasOwn(FORMATS, format)

/** The format a text declares; null when it declares none */
export function textFormatOf({ format }: FieldConstraints): DeclaredFormat | null {
	return isTextFormat(format) ? { id: format, spec: FORMATS[format] } : null
}

/** A format's source as the regex literal database builds from it under u, as the manifest states a pattern */
export const sourceLiteral = (source: string): string => `/${new RegExp(source, "u").source}/u`

/** The test a value meets to be of `spec`'s format, as written after its transforms: its length, its source, its registry */
function formatTest(spec: FormatSpec): string {
	const length =
		spec.min === spec.max
			? [`ctx.value.length === ${spec.min}`]
			: [
					...(spec.min > 0 ? [`ctx.value.length >= ${spec.min}`] : []),
					...(spec.max === null ? [] : [`ctx.value.length <= ${spec.max}`]),
				]
	const member = spec.member === null ? [] : [`database.${spec.member}(ctx.value)`]
	return [...length, `${regexExpression(sourceLiteral(spec.source))}.test(ctx.value)`, ...member].join(" && ")
}

/** A format's own length bounds as JSON Schema states them; none at a floor of 0 or no cap */
const lengths = ({ max, min }: FormatSpec): Record<string, number> => ({
	...(min > 0 ? { minLength: min } : {}),
	...(max === null ? {} : { maxLength: max }),
})

/**
 * The format's check and what it publishes: its source as `pattern`, or, beside a declared pattern
 * zod publishes as `pattern` itself (`declaresPattern`), in an `allOf`, and its length bounds
 */
export function formatCheck({ id, spec }: DeclaredFormat, declaresPattern: boolean): string {
	const issue = `{ code: "invalid_format", format: ${JSON.stringify(id)}, input: ctx.value, origin: "string" }`
	const source = declaresPattern ? { allOf: [{ pattern: spec.source }] } : { pattern: spec.source }
	return `.check((ctx) => { if (!(${formatTest(spec)})) ctx.issues.push(${issue}) })${metaOf({ ...source, ...lengths(spec) })}`
}

/** The bounds of `range` the format's own leave to a check of zod's: those tighter than its */
export const tighterBounds = (
	{ max, min }: { max: number | null; min: number | null },
	spec: FormatSpec,
): { max: number | null; min: number | null } => ({
	max: max !== null && (spec.max === null || max < spec.max) ? max : null,
	min: min !== null && min > spec.min ? min : null,
})
