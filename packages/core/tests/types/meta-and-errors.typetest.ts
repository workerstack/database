/**
 * The meta readers' results and the error handlers' signatures, as a consumer's compiler sees
 * them. Checked by `bun run typecheck`; nothing here runs.
 */
import { expectTypeOf } from "vitest"
import {
	type EntityMeta,
	type DatabaseMeta,
	type QueryMeta,
	readEntityMeta,
	readDatabaseMeta,
	readQueryMeta,
} from "../../src/meta.ts"
import { pgErrorHandler } from "../../src/pg/error-handler.ts"
import { sqliteErrorHandler } from "../../src/sqlite/constraint-handler.ts"
import { d1ErrorHandler } from "../../src/sqlite/d1/error-handler.ts"
import { DatabaseError } from "../../src/error.ts"
import type { DatabaseErrorHandler } from "../../src/types.ts"

expectTypeOf(readDatabaseMeta).returns.toEqualTypeOf<DatabaseMeta | null>()
expectTypeOf(readEntityMeta).returns.toEqualTypeOf<EntityMeta | null>()
expectTypeOf(readQueryMeta).returns.toEqualTypeOf<QueryMeta | null>()
/* a reader takes anything: it is the one that decides what the input holds */
expectTypeOf(readDatabaseMeta).parameter(0).toEqualTypeOf<unknown>()

/* every handler fits the one shape an app wires in, and returns nothing: it throws or falls through */
expectTypeOf(sqliteErrorHandler).toMatchTypeOf<DatabaseErrorHandler>()
expectTypeOf(d1ErrorHandler).toMatchTypeOf<DatabaseErrorHandler>()
expectTypeOf(pgErrorHandler).toMatchTypeOf<DatabaseErrorHandler>()
expectTypeOf(d1ErrorHandler).returns.toEqualTypeOf<void>()

/*
 * QE5 of r22b: a DatabaseError's cause is the message a client may see, so it is a string; the
 * original error, which can hold SQL and bound values, goes on source.
 */
expectTypeOf<NonNullable<ConstructorParameters<typeof DatabaseError>[0]["cause"]>>().toEqualTypeOf<string>()
expectTypeOf<DatabaseError["cause"]>().toEqualTypeOf<string | undefined>()
// @ts-expect-error -- an error object is a source, never a cause
void new DatabaseError({ cause: new Error("Failed query"), errorKey: "x", status: "conflict" })
