/**
 * One JSON value, `DatabaseJsonValue`, for every generated DTO of every database. A
 * schema under an id must be one object per process: zod refuses two schemas under one id in one
 * JSON Schema run, so a definition each database's `_shared` module wrote threw when one document
 * held the DTOs of two. z.json() as a union, its recursion lazy inside: the id on z.json() names
 * its lazy, and its body still publishes as a positional `__schemaN`.
 */
import * as z from "zod"

/** The JSON value union under database's id */
function databaseJsonValue(): z.ZodType<z.core.util.JSONType> {
	const value: z.ZodType<z.core.util.JSONType> = z
		.union([
			z.string(),
			z.number(),
			z.boolean(),
			z.null(),
			z.array(z.lazy(() => value)),
			z.record(
				z.string(),
				z.lazy(() => value),
			),
		])
		.meta({ id: "DatabaseJsonValue" })
	return value
}

/** Any JSON value, null included, published once as `#/$defs/DatabaseJsonValue` */
export const jsonValue: z.ZodType<z.core.util.JSONType> = /* @__PURE__ */ databaseJsonValue()
