---
description: Errors
order: 60
---

# Errors

## `DatabaseError`

<!-- ts-context
declare const original: unknown
-->

```ts
import { DatabaseError, databaseErrorKeys } from "@workerstack/database"

throw new DatabaseError({
	errorKey: databaseErrorKeys.UNIQUE_CONSTRAINT_VIOLATION,
	status: "conflict",
	table: "author",
	column: "email",
	cause: "Email already registered",
	source: original,
})
```

`status` is a `StatusKey`, not a number — `bad_request`, `conflict`, `forbidden`, `unprocessable_entity`, `internal_server_error`, `service_unavailable`. The numeric `.status` is derived from it, so an HTTP layer can read `.status` and a log layer can read `.statusKey`.

Built-in keys (`databaseErrorKeys`): `CHECK_CONSTRAINT_VIOLATION`, `CONSTRAINT_VIOLATION`, `CURSOR_NOT_WIRED`, `CURSOR_PAGINATION_UNSUPPORTED`, `DATABASE_IO_ERROR`, `DATABASE_READONLY`, `DATABASE_UNAVAILABLE`, `EXCLUSION_CONSTRAINT_VIOLATION`, `FILTER_NOT_WIRED`, `FOREIGN_KEY_VIOLATION`, `INVALID_CURSOR`, `INVALID_PAGE`, `INVALID_SELECT`, `INVALID_STATE_TRANSITION`, `INVALID_VALUE`, `PAGE_NOT_WIRED`, `PAGE_TOO_DEEP`, `PRIMARY_KEY_VIOLATION`, `REQUIRED_FIELD_MISSING`, `SEARCH_NOT_WIRED`, `SHARDS_FULL`, `SORT_NOT_WIRED`, `STORAGE_LIMIT_REACHED`, `UNIQUE_CONSTRAINT_VIOLATION`, `VALUE_TOO_LARGE`. `databaseDriverErrorKeys` lists the subset the database classifiers (`classifyD1Error`, `classifySqliteError`, `classifyPgError`) answer with, for a map of database errors to iterate.

`SHARDS_FULL` (503) means no shard has room for a new organization: provision another D1 database.

## Constraint maps

A constraint map turns a constraint violation into your domain's error, keyed by what every dialect's message lets the handler read: a unique by its columns' SQL names, comma-joined (`email`, `org_id,slug`); a unique index on an expression by its index name; a foreign key by its first column's SQL name; a CHECK, and on Postgres an exclusion, by its constraint name. SQLite and D1 report a plain unique's columns and no foreign key's name, so a map keyed by those names works on Postgres alone; key it as codegen does. Their message names no foreign key at all, so their handler blames a `foreignKey` entry only where it is the one key the maps list for the table and the statement sets that column; any other foreign-key failure there is the generic 409, a `REPLACE` or `INSERT OR REPLACE` into a table other tables reference among them, as it deletes the rows its values conflict with. A foreign-key failure a trigger makes in another table is blamed on the statement table's listed key when the statement sets it, as the message cannot tell the two apart. List every foreign key of the table, as codegen does: a key the map leaves out that fails beside the listed one is blamed on it:

```ts
import type { ConstraintMap } from "@workerstack/database"

export const authorConstraints: ConstraintMap = {
	author: {
		unique: {
			email: {
				cause: "email",
				errorKey: "email_already_registered",
				statusKey: "conflict",
			},
		},
		foreignKey: {
			org_id: { cause: "org_id", errorKey: "org_not_found" },
		},
		check: {
			author_locale_check: { cause: "locale", errorKey: "locale_invalid", statusKey: "bad_request" },
		},
	},
}
```

`database codegen -g constraints` writes this file from your table definitions, so each key always matches what the migration actually created. A CHECK enters the map from ``check("name", sql`…`)`` or `check("name", sql.raw("…"))`; a `check()` codegen cannot read, such as one named by a variable or built from a variable, fails the run with its file and line rather than be left out. A unique index on an expression, such as `lower(email)`, is keyed by its index name under `unique` on every dialect. On Postgres, an `exclusion` record maps an `EXCLUDE` constraint by name; without an entry its violation is a 409 `exclusion_constraint_violation`. `referenced` lists a table's columns that another table's foreign key points at, which codegen fills: on SQLite, whose message names no side, an `UPDATE` or an upsert's `DO UPDATE SET` that assigns one answers the neutral "Referenced record does not exist or is still in use", as it may have failed on a row that references the old value. A hand-written map should add it; without it the table's own key is blamed as before. On Postgres, `partitions` lists a partitioned table's partitions, which codegen fills from `database.config.ts`'s `partitions`: Postgres reports a violation on the partition, and the map reads it as the parent's, under its keys and its `private` list. On every dialect, a violation on a table the maps given key nowhere, such as a partition left out or a table outside the schema a trigger writes, names no column, as no map can say which of its columns are private. A key ending in `*` is a prefix pattern for tables an app makes at run time, which no generated map can name: add `"ut_*": {}` beside the generated map, once at module load (`const MAPS = defineConstraintMaps({ ...DB_CONSTRAINT_MAP, "ut_*": {} })`), and every `ut_` table is known, its columns named, with the entry's `private` list and constraints if it has them. A table's own key wins over a pattern, and the longest pattern over a shorter one; a `*` anywhere but a key's end is a `TypeError`. `private` lists a table's private columns by SQL name, which codegen fills too: an error names none of them, so its `column` is unset and its cause generic ("Required field missing", "Duplicate value detected", "Invalid value"), and each constraint on one answers its table's own key for its kind, `<table>_duplicate`, `<table>_reference_not_found`, `<table>_value_invalid` or `<table>_check_failed`, which names neither the column nor the constraint. A map without the list names every column as before.

## Handlers

Three handlers, one signature — `(error: unknown, constraintMaps: readonly ConstraintMap[]) => void`. Each walks the error's `cause` chain past wrappers such as drizzle's `DrizzleQueryError`, reads the engine's own code, finds the matching map entry, and throws a `DatabaseError`. If nothing matches, they return and let the original error propagate.

<!-- ts-context
declare const db: { insert(table: unknown): { values(row: unknown): Promise<unknown> } }
declare const author: unknown
declare const input: unknown
declare const authorConstraints: import("@workerstack/database/types").ConstraintMap
-->

```ts
import { defineConstraintMaps } from "@workerstack/database"
import { d1ErrorHandler } from "@workerstack/database/sqlite/d1/error-handler"
import { pgErrorHandler } from "@workerstack/database/pg/error-handler"
import { sqliteErrorHandler } from "@workerstack/database/sqlite/constraint-handler"

/* once, at module load: a malformed key fails here, not at the first violation */
const MAPS = defineConstraintMaps(authorConstraints)

try {
	await db.insert(author).values(input)
} catch (error) {
	d1ErrorHandler(error, MAPS)
	throw error
}
```

Build the maps you pass once, at module load, with `defineConstraintMaps(...maps)` (from `@workerstack/database`): it refuses, as a TypeError naming the key, a prefix pattern with its `*` anywhere but the end (`"ut_*_rows"`), so a typo fails at startup and in tests, never at the first violation. A handler given maps not built with it still answers each violation with its well-formed keys, and warns once per process (`database.constraint-maps.error`, on `console.warn`) of each malformed key, which matches no table, however many arrays or maps carry it, a map spread per call included.

- `sqliteErrorHandler` — libsql, Turso and `bun:sqlite`. Classifies by SQLite's extended result code: the primary key by `SQLITE_CONSTRAINT_PRIMARYKEY`, a CHECK by its constraint name (in the statement's table first, then the one other table whose map names it, as a trigger's write fails another table's CHECK; generic with no table when two or more do), a composite unique by its columns together, naming no one column, NOT NULL with its column. A duplicate rowid, an FTS5 table's included, is a primary key violation (409). It also maps `SQLITE_FULL` (422) and `SQLITE_BUSY` / `SQLITE_LOCKED` / `SQLITE_READONLY` (503).
- `d1ErrorHandler` — Cloudflare D1. Constraint violations go through the same SQLite mapping. Other errors with an SQLite code are query errors (500); a D1 platform failure without one is transient (503) or a storage limit (422).
- `pgErrorHandler` — PostgreSQL on node-postgres, postgres.js and Bun.SQL. Classifies by SQLSTATE (read from `code`, or Bun.SQL's `errno`) and reads `table`/`table_name`, `constraint`/`constraint_name` and `column`/`column_name` alike. The primary key is a 23505 on `<table>_pkey`.
- `handleConstraintViolation` — the constraint half of `sqliteErrorHandler`. It also accepts an engine message given as text.
- `classifySqliteError`, `classifyD1Error`, `classifyPgError` — the same answers without throwing: the `DatabaseError` each handler would throw, or `undefined` when it would throw nothing, so code that expects one violation can ask instead of catching: `classifyD1Error(error, maps)?.errorKey === "project_member_taken"`.

A rule a trigger enforces is the same 400 `constraint_violation` on every engine, its cause the message the app raised: `RAISE(ABORT, 'qty must be positive')` on SQLite, libsql and D1 (`SQLITE_CONSTRAINT_TRIGGER`), and `RAISE EXCEPTION 'qty must be positive'` (P0001) on Postgres. Write that message for the client. On libsql over a network and on Turso, the cause is the generic "Constraint violated": the server sends a violation's bare code with no `_TRIGGER`, so a raised message cannot be told from SQLite's own words. For the same reason a primary key conflict there is the 409 `unique_constraint_violation` its words describe (`UNIQUE constraint failed: parent.id`), not `primary_key_violation`. Every other violation there reads as on a file, its status, map entry and column included.

Each handler answers a value the request sent that the column cannot hold from one shared table, so the same bad value is the same 400 on every engine. The answer names the column where the engine does, never the value: Postgres names none for text that is no number or a string past `varchar(n)` (22P02, 22001), so there the cause is a bare "Invalid value". `invalid_value` covers a string past `varchar(n)`, a number out of range, text that is no number, a NUL byte, a date that does not parse or is out of range, a time zone offset past 15:59, an interval past its range, a bit string of the wrong length, malformed xml (SQLSTATE 22001, 22003, 22021, 22P02, 22P05, 22007, 22008, 22009, 22015, 22026, 2200N, 2200M), and a STRICT table's column given another type (`SQLITE_CONSTRAINT_DATATYPE`, `SQLITE_MISMATCH`). `value_too_large` covers a value too large for an index row (54000) and a string or blob past the engine's limit (`SQLITE_TOOBIG`, 2 MB on D1). A foreign-key violation from a delete or a key update of a row others still reference names the statement's table, the parent, on every engine, wherever the SQL is recorded (drizzle's error, postgres.js's own); a bare node-postgres error records none, and names no table.

A `DatabaseError`'s `cause` is safe to show a client, and `toJSON()` puts it in the body beside `column`, `errorKey`, `status`, `statusKey` and `table`, each optional one left out when unset. The original error, which can hold the SQL and its bound values, is on `source`, which is never serialized; log it, don't return it.
