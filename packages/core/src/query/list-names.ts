/**
 * The names a list schema publishes, each one a request must be able to spell: a sort key the order
 * grammar reads back as itself, and a filter field the filter grammar reads as one condition on it.
 * A name either grammar reads as another builds a schema whose published examples it refuses.
 */
import { parseFilter, parseOrder } from "./filter.ts"

/** What the order grammar takes for its own, which no sort key may hold */
const ORDER_GRAMMAR =
	"which reads a comma, a leading or trailing space and a trailing .asc, .desc, .nullsfirst or .nullslast as its own"

/** Whether `key` reads back as itself in an order param, bare and with a direction and nulls */
function spellsSortKey(key: string): boolean {
	const [bare, ...restBare] = parseOrder(key) ?? []
	const [full, ...restFull] = parseOrder(`${key}.desc.nullsfirst`) ?? []
	return (
		restBare.length === 0 &&
		restFull.length === 0 &&
		bare?.field === key &&
		bare.direction === "asc" &&
		bare.nulls === undefined &&
		full?.field === key &&
		full.direction === "desc" &&
		full.nulls === "first"
	)
}

/** `key` as the tiebreak, refused at build when no order param can spell it */
function refuseUnspelledTiebreak(key: string): string {
	if (spellsSortKey(key)) return key
	throw new TypeError(
		`createListQuerySchema: tiebreak ${JSON.stringify(key)} cannot be named in an order param, ${ORDER_GRAMMAR}; give the column a key without them`,
	)
}

/** Whether the filter grammar reads `field.eq.1` as one condition on `field` */
function spellsFilterField(field: string): boolean {
	const root = parseFilter(`${field}.eq.1`)?.root
	const [condition, ...rest] = root?.conditions ?? []
	return root?.subgroups.length === 0 && rest.length === 0 && condition?.field === field
}

/** Throws a TypeError naming the first sort or filter name a request cannot spell */
function refuseUnspelledNames(sort: readonly string[], filter: readonly string[]): void {
	const sortKey = sort.find((key) => !spellsSortKey(key))
	if (sortKey !== undefined)
		throw new TypeError(
			`createListQuerySchema: sort field ${JSON.stringify(sortKey)} cannot be named in an order param, ${ORDER_GRAMMAR}; give the field a key without them`,
		)
	const field = filter.find((name) => !spellsFilterField(name))
	if (field !== undefined)
		throw new TypeError(
			`createListQuerySchema: filter field ${JSON.stringify(field)} cannot be named in a filter param, which does not read "${field}.eq.1" as one condition on it; give the field a key without a comma, a parenthesis or a leading or trailing space`,
		)
}

export { refuseUnspelledNames, refuseUnspelledTiebreak }
