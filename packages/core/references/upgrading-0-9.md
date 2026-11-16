---
description: Upgrading to 0.9
order: 350
---

# Upgrading to 0.9

0.9.1 is the first 0.9 release on npm: 0.9.0 was tagged but never published, since its release failed before either registry received it. 0.9 closes the findings of a fresh review of 0.8.0. It is a breaking minor; what changes for a project on 0.8:

**Migrations**

- **Writes rate by what they may destroy.** Every `DELETE` is unsafe, whatever its `WHERE` (no reading of a `WHERE` proves it spares a row). An `UPDATE`, an upsert's `DO UPDATE`, and a `MERGE` that updates are unsafe unless they only backfill: they write a table the same file created, or only columns the same file added that nothing has written since, which is cautious. `REPLACE`, `INSERT OR REPLACE` and `UPDATE OR REPLACE` are unsafe. A data migration that `--yes` approved in 0.8 now needs `-- comb:allow-unsafe:` with its reason.
- **A rebuild's copy is cautious only in Atlas's form**: each column from itself, bare, cast, or `IFNULL(column, <its new default>)`, over the whole table. A copy that filters, joins, substitutes a value or renames a source is unsafe, naming the clause or the column.
- **Rowids survive a rebuild**, the rebuilt table's included, beside up to 99 columns; at 100 columns without an `INTEGER PRIMARY KEY` the rows are kept under new rowids and the classification names the table. New diffs write the copy as `INSERT INTO new_t (rowid, …) SELECT rowid, …`.
- **The rebuild guard defers its own keys**, so a closure that is a reference cycle refills; and a rebuild in a SQLite file with `-- atlas:txmode none` is refused by `diff` and unsafe for `apply`, as it needs the file's transaction.
- **D1 `status` and `check` write nothing**: a database without `d1_migrations` reads as nothing applied. Only `apply` and `baseline` create the table.
- **The D1 provider takes no `databaseId`.** Remove it from `comb.migrate.config.ts`: wrangler finds the database by `databaseName` and the wrangler config's `database_id`. A config that still passes one fails to load, saying so.
- `migrate apply`, `check` and `status` take `--json`: one object, `{ database, applied, pending, refused }`, as the only stdout, the human lines on stderr.
- `confirmDrops` and its `ConfirmDrops` type are removed from `@workerstack/database/migrate`; `dropsQuestion` stays.

**Queries**

- An empty `or()` matches no row and an empty `and()` every row, alone or nested; 0.8 dropped an empty group, widening the filter.
- A number filter with an integer outside ±(2^53 − 1), and a date outside ±8.64e15 ms, is a 400, as is a cursor that carries such a date.
- A `q` that holds only FTS syntax (`AND OR`, `*`) matches no row; an empty `q` is still no search.
- Spellfix search requires every term, each matched by itself or one of its corrections; 0.8 matched any term.
- A relation filter back to the main table (`item → link → item`) reads the outer row; its join tables are aliased in the `EXISTS`.
- A relation without `relationFields` selects no field; declare the fields a client may embed.
- `parseSelect` throws a 400 (`invalid_select`) on a select it cannot parse, instead of returning null, which `queryHelpers.project` read as every column.
- `queryHelpers.paginate` throws `sort_not_wired` (500) when a row lacks a sort key or the id, instead of minting a cursor that repeats or ends the list.
- `escapeLike` is exported from `@workerstack/database/query`. `hasRelation`, `hasScalarsRequested`, `getRelationSelection`, `buildRelationColumns`, `getEntityColumns`, `buildColumns`, `getPrimarySortDirection` and the `PaginationOptions` and `PaginationQueryInput` types are removed: nothing used them.

**Errors**

- A new built-in key, `INVALID_VALUE` (`invalid_value`): `pgErrorHandler` maps SQLSTATE 22003, 22P02, 22007 and 22008, a value the column cannot hold, to a 400 naming the column, never the value. A `Record<CombErrorKey, string>` of translations needs the key.
- On D1, `SQLITE_BUSY` and `SQLITE_LOCKED` are 503 `database_unavailable` and `SQLITE_READONLY` 503 `database_readonly`, as on libsql and bun:sqlite.
- A foreign-key violation is read as "still referenced" only from the tail Postgres writes after the key values, so a key value that spells the phrase no longer misleads it.
- The shard router stops routing an org once revalidation finds it soft-deleted, without waiting for the hard TTL.

**Codegen**

- A run writes nothing until every generator succeeds, then replaces its files at once; and it deletes what it wrote last time and no longer writes (a removed table's files), recorded in `.<prefix>.codegen.json` beside the output, never a file without comb's header. Commit that file with the output.
- A column spread, table name or column name comb cannot read fails codegen at its file and line, and so does a constraint key comb does not handle; `name` and `imageUri` are now enforced on writes.
- Read DTOs take a stored password hash as a plain string; update DTOs refuse an empty required string; an email is trimmed and lowercased before it is validated; an id-like column keeps its declared `min`/`max`.
- Timestamps keep the names the table declares: a table mixing `created_at` and `updatedAt` gets no shared spread, and `softDelete` names the property. `TimestampsMeta` gains `names` and a `mixed` style.
- On Postgres, `c.integer` DTOs are bounded to int4, and the enum CHECKs import from `drizzle-orm/pg-core`; the dialect comes from the config, else from the tables file's comb columns import.
- The FTS reference SQL drops and rebuilds each index before creating it again; `_shared` emits only what the DTOs import (the unused timestamp validators and refinements are gone); a relations file without relations is `() => ({})`; two tables whose names make one type name, or that share an id prefix, fail codegen.

**Release**

- The package is published as bun packs it, so its manifest names resolved versions, never `catalog:`.
