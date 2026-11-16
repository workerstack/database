---
description: Upgrading to 0.16
order: 260
---

# Upgrading to 0.16

What changes for a project on 0.15. Before deploying it:

1. **Regenerate, then rename what codegen renames.**
   - Generated subpaths now split at acronyms and digits, as well as at a lowercase-to-uppercase step: `HTTPLog` is `http-log`, `oauth2Token` is `oauth2-token` and `apiKeyV2Token` is `api-key-v2-token`, so a camelCase and a snake_case spelling of one name now always meet. Rewrite the imports of any table whose name holds an acronym or a digit.
   - The run record is `.comb.codegen.gen.json`, named under the `.gen.` convention every formatter config ignores, so a format pass no longer rewrites it. comb does not read the old `.comb.codegen.json`: rename the committed file (`git mv .comb.codegen.json .comb.codegen.gen.json`), or delete it at the cost of one run that removes no stale file.
   - Generated DTO files reach comb's own predicates as `import * as comb from "@workerstack/database"` (`comb.isStorableText`, `comb.isCidr`), and name every global they call through `globalThis`, so a `c.json` schema exported under one of those names can no longer replace it. A schema exported as `comb` or `globalThis` is imported under an alias. Every DTO file's text changes; its behavior does not.
   - A declared bound that holds no value fails codegen, naming the column: a `min` past its `max` on any column, a text `min` or `max` that is not a whole number from 0, a `maxBytes` that is not a whole number from 1. Each used to generate a module that threw on import, or a schema no value passed.
   - A nullable read float publishes `null` once (`anyOf [number, null]`, as a NOT NULL one does); parsing is unchanged. The manifest gains each entity's `partialUniqueIndexes`. Generated enum checks return `CheckBuilder[]` and each sql-cols record is typed `Pick<typeof <table>, …>`, so both compile under `isolatedDeclarations`.

2. **Select the built query's extras.** Every list builder returns `extras`, the columns `paginate` reads: the tiebreak (`_combId`), an offset page's count (`_total`) and, on a cursor that carries a reference, whether its anchor is gone (`_combAnchorGone`). Select them beside your own columns; `paginate` strips them. Rows that lack one the builder selected are a 500 `page_not_wired` naming it, on every page, where a forgotten count read as `count: null`.

   ```diff
   - db.select({ ...cols, ...queryHelpers.countExtra(q) }).from(t).where(q.where).orderBy(...q.orderBy).limit(q.limit).offset(q.offset)
   + db.select({ ...cols, ...q.extras }).from(t).where(q.where).orderBy(...q.orderBy).limit(q.limit).offset(q.offset)
   - const rows = await applyListQuery(db.select().from(post), built)
   + const rows = await applyListQuery((extras) => db.select({ ...getTableColumns(post), ...extras }).from(post), built)
   ```

   `queryHelpers.countExtra` is gone. A relational query passes `extras` on: `findMany({ ...options })`, or `findMany({ extras: options.extras, … })` beside your own fields. The next cursor's id is the `_combId` the builder selected, never a field of the row, so `buildDerivedListQuery` takes no `idField`: the tiebreak is its `idColumn`, or its `anchor`'s.

3. **Build a merged list with `buildListQuery`.** `mergedListOptions` is gone. Build the list once with `merged`, its filter, search and `baseWhere` as for one database, read it on every shard, and page it with `paginateMerged`:

   ```diff
   - const q = buildListQuery({ ...sealed, parsed, table: org, baseWhere })
   - const merged = mergedListOptions(parsed, sealed)
   - const rowsPerShard = await Promise.all(shards.map((db) => db.select({ ...cols, ...extrasOf(merged) }).from(org).where(q.where).orderBy(...q.orderBy).limit(merged.limit).offset(merged.offset)))
   - const [items, page] = paginateMerged(rowsPerShard, merged)
   + const built = buildListQuery({ ...sealed, parsed, table: org, baseWhere, merged: {} })
   + const rowsPerShard = await Promise.all(shards.map((db) => applyListQuery((extras) => db.select({ ...cols, ...extras }).from(org), built)))
   + const [items, page] = paginateMerged(rowsPerShard, built)
   ```

   The result is a `MergedListQueryResult`: `paginate` refuses it, and `paginateMerged` refuses a single database's list, in the types and as a 500 `page_not_wired`. Its window, count and null-anchor reads are the merged builder's own, so a filtered merged list no longer 500s on a cursor anchored on a null key. A merged list never pages by reference, since only one shard holds the row a reference reads back: a sort key too long for a cursor is a 500 `sort_not_wired` on the page that meets it, and a cursor that carries a reference is a 400 `invalid_cursor`.

4. **Rename the list input type.** `buildListQuery`, `buildDerivedListQuery` and `queryHelpers.listOptions` take one `ListQueryInput` (exported from `/query` and `/query/sqlite`), its arrays read only, so a hand-built `as const` query passes. `ListQueryParsed` is gone. `listOptions` no longer takes or returns `sortOrderBy`. A hand-built `limit` that is not a whole number from 1 is a 400 `invalid_page` naming the limit, as a page is. `ListQuerySchema` and `RetrieveQuerySchema` are exported from `/query`, so a module that exports a list or retrieve schema emits its declarations.

5. **Check your filters.**
   - An ISO date filter's validated value is an `IsoInstant` (exported from `/query`): `.ms` is its epoch milliseconds and `.text` its `toISOString()` text, and it writes itself as the text in a string or JSON. Code that compared it with `===` to a string reads `.text`. An instant its offset moves out of the years 0000 to 9999 is a 400, where it was a 500.
   - `buildFilterSQL` lowers each condition as `filterToSQL` does, `contains` and ISO instants included. A mapped column that stores something is `{ column, kind }`, `kind` one of `"text"`, `"number"`, `"numeric"`, `"date-ms"`, `"date-s"` and `"as-is"` (`ColumnKind`, from `/query/sqlite`):

     ```diff
     - columnMap: { createdAt: { column: "created_at", unit: "s" } }
     + columnMap: { createdAt: { column: "created_at", kind: "date-s" } }
     ```

   - `createListQuerySchema` refuses a `limits` value that is not a whole number from 0, a `TypeError` naming the key; write "no cap" as a large whole number.

6. **Check your configs at load.**
   - A migrate config database is either `name` and `provider`, or non-empty `environments` each resolving a provider; an environment's `name` defaults to its key. Both shapes at once, an empty `environments` and an environment with no provider are refused at load, naming the file. A `defineConfig` typo prints the same readable message, with the path, as a plain object's.
   - `comb.config.ts` is held to a strict schema: an unknown key (an FTS table's `contentTable`, which nothing read, included) is refused, naming the file. `FtsTableConfig.tokenizer` is typed `string | undefined`.
   - A Postgres `url` may be empty until a command resolves its environment. A URL with no user is the OS user's, its database that user's, as libpq reads it; comb's own reads take no `PGUSER`, `PGDATABASE` or `PGPASSWORD`. `hostaddr` is the address comb connects to and `host` the TLS name; `fallback_application_name` sets `application_name` where the URL names none.
   - The D1 provider connects to its own `databaseName`: `provider.connect(resolveDatabaseConfig(db, env))` no longer opens a D1 named after the environment.

7. **Re-check pending migrations.** Run `comb migrate check` on each environment before applying; ratings changed both ways.
   - Stricter: a SQLite file's own `BEGIN`, `COMMIT`, `END`, `ROLLBACK` or `START TRANSACTION` is refused, with no override. `ATTACH PARTITION`, `REFRESH MATERIALIZED VIEW` without `CONCURRENTLY` and `LOCK` in `SHARE` mode or stronger carry a lock warning. An added column whose default calls a function carries the rewrite warning unless the function is known IMMUTABLE or STABLE (a listed built-in, or a history routine every overload of which says so).
   - Looser: a retype that only widens, with no `USING`, is safe; `ENABLE TRIGGER` and its forms are cautious.
   - A Postgres baseline compares views, materialized views, sequences and policies as it compares functions and triggers, leaving out a partition's cloned trigger.
   - On libsql, a `_cf_` table is now the project's own (only D1 owns that prefix), so it appears in `diff`, `baseline` and `status`: a libsql project with `_cf_` tables sees new drift. Litestream's tables are left out on every engine.
   - `apply --file` on a file of the migrations directory refuses while a file before it is pending. A refused D1 or Turso apply or baseline writes nothing. A directory with no `.sql` file and no `atlas.sum` is an empty history; `.sql` files with no sum are refused, naming `comb migrate diff`.
   - `lockTimeout` takes Postgres's duration grammar (`250`, `1.5s`, `500us`, `1h`).

8. **Expect new answers from the error handlers.**
   - A D1 `exec()` error, which quotes the statement and its values, answers its generic cause, never a column or table read from that text.
   - A duplicate rowid, an FTS5 table's included, is a 409 `primary_key_violation`; a bound value that spells D1's "pattern too complex" is no longer a 400.
   - On Postgres, a violation reported on a partition is classified under the statement's own table, and a table no map knows names no column. A composite foreign key names no column. A driver's lost or refused connection (`ECONNREFUSED`, `ECONNRESET`, a pool or connect timeout, Bun's `ERR_POSTGRES_CONNECTION_*`, node-postgres's "Connection terminated unexpectedly") is a 503 `database_unavailable`, where it was unclassified.

9. **Remove what was removed, and know what was added.** `ensureMigrationsTable`, `checkMigrationHash` and `recordMigrationHash` are no longer exported from `/migrate`: comb's own apply creates and upgrades its history table. `withRetry` reads transience from an error's `status` or network `code`, never its message. `Connection.batch` states its contract per driver: one transaction on SQLite, libsql and bun:sqlite; on D1, its statements in order, with no rollback when one fails, so code that relied on a D1 batch being atomic must not. `fieldConstraintsOf` (`/codegen`) takes a required `measure`, `"length"` for a text column's bounds and `"value"` for a number's, which it reads its bounds by, and refuses any other. New exports: `IsoInstant`, `ListQuerySchema` and `RetrieveQuerySchema` (`/query`), `ListQueryInput` (`/query` and `/query/sqlite`), `ColumnKind`, `ListExtras` and `MergedListQueryResult` (`/query/sqlite`, the latter also from `/sqlite/d1/sharding`). (`TursoMissing` was listed here, but `/migrate` exports it from 0.17.)

10. **Give the shard router a `log`.** With none, `shard-router.kv.error` and `shard-router.revalidate.error` now go to `console.warn`, where they were dropped; pass `log` to route them, or `log: () => {}` to mute them. A KV read that fails trusts nothing in KV: the request reads the primary and caches in its own isolate only. `resolveVerified` writes and logs nothing when the primary names the shard it probed.

11. **The CLI.** `-h` and `--help` work at every level, `--version` prints comb's version, an option given twice is refused, and a bare `comb migrate` exits 1 with its usage. Under `--json`, a refused argv prints the JSON object too. `migrate diff` refuses a project with no drizzle config before drizzle-kit runs, and the approval prompt goes to stderr.
