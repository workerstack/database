import { formatTakes } from "./catalog.ts"

/**
 * Whether `value` is a well-formed BCP 47 language tag, RFC 5646 §2.1's Language-Tag, exactly as
 * written: a langtag such as zh-Hant-TW or es-419, a private-use tag such as x-private, or a
 * grandfathered tag such as i-klingon. It takes what a `format: "bcp47"` column takes before its
 * trim, from the same grammar: it never trims or folds case, so " en" is no tag. A value that is no
 * string at runtime is refused, and this never throws.
 */
export function isBcp47(value: string): boolean {
	return typeof value === "string" && formatTakes("bcp47", value)
}
