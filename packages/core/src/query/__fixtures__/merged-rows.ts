/**
 * Rows as a merged list's shards read them, for tests that page rows they made themselves: each one's
 * tiebreak, the storage class SQLite holds each sort key and the id in, and its shard's count.
 */

/** The storage class SQLite holds `value` in, as the builder's typeof() answers for a value a driver read so */
export function stored(value: unknown): string {
	if (value === null || value === undefined) return "null"
	if (typeof value === "string") return "text"
	if (value instanceof Uint8Array) return "blob"
	if (value === Number.POSITIVE_INFINITY) return "+inf"
	if (value === Number.NEGATIVE_INFINITY) return "-inf"
	return typeof value === "number" && !Number.isInteger(value) ? "real" : "integer"
}

/**
 * Hand-made rows as a shard reads them through the merged builder: the tiebreak, the storage class
 * of each of `sort`'s keys and of the id, and each row's shard count on an offset page; none on a page by cursor
 */
export const read = <T extends { id: unknown }>(rows: readonly T[], total: number | null = rows.length, sort = ["k"]) =>
	rows.map((row) => ({
		...row,
		_combId: row.id,
		...(sort.length === 0 ? {} : { _combKeyTexts: sort.map(() => "").join(",") }),
		_combKeyTypes: [...sort.map((field) => stored((row as Record<string, unknown>)[field])), stored(row.id)].join(","),
		...(total === null ? {} : { _total: total }),
	}))
