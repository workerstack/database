/**
 * The database meta contract — facts about tables and queries, stamped onto Zod
 * schemas so they survive the trip to JSON Schema and into an OpenAPI document.
 *
 * database publishes facts in database's vocabulary. Mapping them to a consumer's tag
 * names is the consumer's job. See docs/meta-contract.md.
 */
import type { PartialUniqueIndexMeta, UniqueIndexMeta } from "../codegen/analyzer-types.ts"

/** Reserved key. One collision surface, one version field. */
const DATABASE_META_KEY = "x-database"

/**
 * Contract version. Bumped ONLY on a breaking change — a field removed, or a
 * field whose meaning changed. Adding a field never bumps it, which is what
 * lets database and its consumers ship independently.
 */
const DATABASE_META_VERSION = 1

/** Which payload a stamp carries: facts about a table (`entity`) or about a list query (`query`) */
type DatabaseMetaKind = "entity" | "query"

/** Filter grammar database's parser implements — `field.op.value`. */
const FILTER_GRAMMAR = "postgrest"

/** The filter grammar a query meta names, `postgrest`: `field.op.value` */
type FilterGrammar = typeof FILTER_GRAMMAR

/** Facts about an entity, derived from its table definition. */
type EntityMeta = {
	/** The contract version the payload was stamped with, `DATABASE_META_VERSION` */
	v: number
	/** Always `entity` */
	kind: "entity"
	/** Entity name — the SQL table name */
	name: string
	/** Primary key / stable identifier column */
	identity: string
	/** Server-assigned: omitted from create bodies, expected in responses */
	generated: string[]
	/** Must reject or ignore a mutation */
	immutable: string[]
	/** Tombstone column, or null when the entity is hard-deleted */
	softDelete: string | null
	/** Column scoping rows to a tenant, or null when database cannot know (see docs §6.3) */
	tenantColumn: string | null
	/**
	 * Lifecycle of the entity's state column, or null when none is declared.
	 *
	 * `transitions` is deliberately absent: it is a write-side rule, and
	 * publishing the graph would invite a consumer to drive state by walking it.
	 * See docs/state-machines.md §5.
	 */
	states: StatesMeta | null
	/**
	 * The uniqueness that holds over every row: a `uniqueIndex()`, a `unique().on()`
	 * constraint and a column's `.unique()`, in the order the analyzer extracted
	 * them. Empty when none. Never inferred from PKs or column names, and never a
	 * partial index, which `partialUniqueIndexes` holds.
	 */
	uniqueIndexes: UniqueIndexMeta[]
	/**
	 * Partial (`.where()`) unique indexes: their columns are unique only among the
	 * rows `where` matches. Apart from `uniqueIndexes`, so a reader that knows no
	 * predicate claims no uniqueness (docs §6.8). Added within v1, so a producer
	 * may leave it out; readEntityMeta reads its absence as [].
	 */
	partialUniqueIndexes?: PartialUniqueIndexMeta[] | undefined
}

/** The published subset of a column state machine — describes a lifecycle, not how to drive it. */
type StatesMeta = {
	/** The column the machine governs */
	column: string
	/** Every legal value, in declaration order */
	values: string[]
	/** The value a row starts at, or null when the machine declares none */
	initial: string | null
	/** The values no transition may leave; empty when none are declared */
	terminal: string[]
}

/** One filterable field with the operators its type accepts. */
type FilterFieldMeta = {
	/** The field's name, as a filter names it */
	field: string
	/** The field's filter type: `string`, `number`, `boolean`, `date` or `enum` */
	type: string
	/** The operators a filter may apply to the field, such as `eq` or `in` */
	ops: string[]
}

/**
 * Facts about a list query, derived from the config that parses the request.
 * Fields marked optional were added after v1 shipped; a v1 reader built before
 * them ignores them, which is why adding them did not bump `v`.
 */
type QueryMeta = {
	/** The contract version the payload was stamped with, `DATABASE_META_VERSION` */
	v: number
	/** Always `query` */
	kind: "query"
	/** The fields a `filter` may name */
	filterable: string[]
	/** `filterable` with types and operators */
	filterFields?: FilterFieldMeta[] | undefined
	/** The fields an `order` may name */
	sortable: string[]
	/** Null placements every sortable field accepts */
	nulls?: Array<"first" | "last"> | undefined
	/** Conditions one `filter` may hold */
	maxFilterConditions?: number | undefined
	/** Nested `or()` and `and()` groups one `filter` may hold below its top level */
	maxFilterDepth?: number | undefined
	/** Values one filter binds in all, every in/nin member counted */
	maxFilterValues?: number | undefined
	/** Values one `in` or `nin` list may hold */
	maxInValues?: number | undefined
	/**
	 * UTF-8 bytes of the escaped pattern of a `like` or `ilike` value with a `*` inside it, as SQLite
	 * reads it: a `[` in a `like` is the three bytes `[[]`, a `%` or `_` in an `ilike` two. A value whose
	 * only `*` are at its ends is no pattern and takes no cap. Not the raw value's characters.
	 */
	maxPatternBytes?: number | undefined
	/** Bytes one `filter` may take however a client encodes it, beside its character cap */
	maxFilterBytes?: number | undefined
	/** Bytes the whole query string database accepts takes at most, however a client encodes it: 16 KB less a 2 KB path budget */
	maxQueryBytes?: number | undefined
	/** Whitespace-separated words one `q` may hold */
	maxSearchTerms?: number | undefined
	/** Bytes one `q` may take however a client encodes it */
	maxSearchBytes?: number | undefined
	/** Keys one `order` may hold */
	maxSortKeys?: number | undefined
	/** null = not knowable at this layer, which is not the same as "none" (docs §6.1) */
	searchable: string[] | null
	/** The fields a `select` may name */
	selectable: string[]
	/** The largest `limit` a request may ask for */
	maxLimit: number
	/** The last page offset pagination serves; past it, a client pages by cursor */
	maxPage?: number | undefined
	/** e.g. "created_at.desc" — the order applied when the request names none */
	defaultOrder: string
	/** Tiebreak column for keyset pagination */
	stableTiebreak: string
	/** The filter grammar `filter` is parsed with */
	grammar: FilterGrammar
}

/** A database meta payload: an entity's or a list query's, told apart by `kind` */
type DatabaseMeta = EntityMeta | QueryMeta

/** Payload accepted by databaseMeta() — the version is stamped for you. */
type EntityMetaInput = Omit<EntityMeta, "v">
/** A query payload as databaseMeta() takes it, without `v` */
type QueryMetaInput = Omit<QueryMeta, "v">
/** A payload as databaseMeta() takes it, entity or query, without `v` */
type DatabaseMetaInput = EntityMetaInput | QueryMetaInput

/** The object databaseMeta() produces, ready for `.meta()`. */
type DatabaseMetaStamp<T extends DatabaseMeta = DatabaseMeta> = { [DATABASE_META_KEY]: T }

export {
	FILTER_GRAMMAR,
	DATABASE_META_KEY,
	DATABASE_META_VERSION,
	type EntityMeta,
	type EntityMetaInput,
	type FilterFieldMeta,
	type FilterGrammar,
	type DatabaseMeta,
	type DatabaseMetaInput,
	type DatabaseMetaKind,
	type DatabaseMetaStamp,
	type QueryMeta,
	type QueryMetaInput,
	type StatesMeta,
	type PartialUniqueIndexMeta,
	type UniqueIndexMeta,
}
