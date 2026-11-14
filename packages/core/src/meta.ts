/**
 * The database meta contract — facts about tables and queries, stamped onto Zod
 * schemas so they survive the trip to JSON Schema and into an OpenAPI document.
 *
 * database publishes facts in database's vocabulary. Mapping them to a consumer's tag
 * names is the consumer's job. See docs/meta-contract.md.
 */
import {
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
	type UniqueIndexMeta,
} from "./meta/contract.ts"
import { isRecord, readEntityMeta, readDatabaseMeta, readQueryMeta } from "./meta/read.ts"

/**
 * Build the stamp for a Zod `.meta()` call.
 *
 * Stamp the schema you RETURN, not the one you build from — a transform/pipe
 * does not forward the base's metadata to the output view. See docs §3.1.
 */
function databaseMeta(meta: EntityMetaInput): DatabaseMetaStamp<EntityMeta>
/** Build the stamp for a list query schema's `.meta()` call; `v` is stamped for you */
function databaseMeta(meta: QueryMetaInput): DatabaseMetaStamp<QueryMeta>
function databaseMeta(meta: DatabaseMetaInput): DatabaseMetaStamp {
	return { [DATABASE_META_KEY]: { ...meta, v: DATABASE_META_VERSION } as DatabaseMeta }
}

/** Minimal shape of a Zod schema, so this module needs no zod import. */
export type MetaCarrier<T> = {
	/** Zod's `.meta()`: returns a copy of the schema carrying `m` */
	meta: (m: Record<string, unknown>) => T
}

/**
 * Re-stamp `to` with the facts `from` carries.
 *
 * `.extend()` drops registry metadata silently (docs §5), so a consumer who
 * extends a generated read schema loses the entity facts with no diagnostic.
 * This is the recovery path.
 */
function carryDatabaseMeta<T>(from: unknown, to: MetaCarrier<T>): T | null {
	const meta = readDatabaseMeta(toJsonSchemaLike(from))
	if (!meta) return null
	return to.meta({ [DATABASE_META_KEY]: meta })
}

/**
 * What carries the facts: a JSON Schema holds them at its root, a Zod schema in its registry
 * metadata, which `.meta()` with no argument returns.
 */
function toJsonSchemaLike(value: unknown): unknown {
	if (isRecord(value) && DATABASE_META_KEY in value) return value
	const meta = (value as { meta?: unknown } | null)?.meta
	return typeof meta === "function" ? (meta as () => unknown).call(value) : value
}

export {
	carryDatabaseMeta,
	FILTER_GRAMMAR,
	DATABASE_META_KEY,
	DATABASE_META_VERSION,
	databaseMeta,
	type EntityMeta,
	type EntityMetaInput,
	type FilterGrammar,
	type DatabaseMeta,
	type DatabaseMetaInput,
	type DatabaseMetaKind,
	type DatabaseMetaStamp,
	type FilterFieldMeta,
	type QueryMeta,
	type QueryMetaInput,
	type StatesMeta,
	type UniqueIndexMeta,
	readEntityMeta,
	readDatabaseMeta,
	readQueryMeta,
}
export type { ReadOptions } from "./meta/read.ts"
