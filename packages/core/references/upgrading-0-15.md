---
description: Upgrading to 0.15
order: 270
---

# Upgrading to 0.15

What changes for a project on 0.14.1. Before deploying it:

1. **Regenerate, then rewrite the imports of generated subpaths.** Every generated subpath of a table is its export's name in kebab case, camelCase and snake_case both, for its DTOs, rqb-cols and sql-cols and their directories alike. The DTOs of a camelCase export keep their path:

   ```diff
   - import { blogPostRqbCols } from "@app/db/rqb-cols/blogPost"
   - import { tableTemplateSqlCols } from "@app/db/sql-cols/table_template"
   - import { tableTemplateDtoReadSchema } from "@app/db/dtos/table_template"
   + import { blogPostRqbCols } from "@app/db/rqb-cols/blog-post"
   + import { tableTemplateSqlCols } from "@app/db/sql-cols/table-template"
   + import { tableTemplateDtoReadSchema } from "@app/db/dtos/table-template"
   ```

   Two tables whose names meet in kebab case (`blogPost` and `blog_post`) are a codegen error; rename one export. The rest of the diff changes no behavior: each entity stamp gains `partialUniqueIndexes`, each list query stamp `maxPatternBytes`, and the constraint map drops the enum CHECK entries of tables that apply no enum CHECK, which could never fire.

2. **Hand `paginate` the built query.** Every builder's result carries `pagination`, which holds the parsed query, the cursor options and the keyset in one, so `paginate` and `paginateMerged` take it in place of the parsed query and options:

   ```diff
   - const [items, page] = queryHelpers.paginate(rows, parsed, { cursorScope, cursorSecret })
   + const options = queryHelpers.listOptions(parsed, { cursorScope, cursorSecret })
   + const [items, page] = queryHelpers.paginate(rows, options)
   - const [items, page] = paginateMerged(rowsPerShard, parsed, { cursorScope, cursorSecret })
   + const [items, page] = paginateMerged(rowsPerShard, mergedListOptions(parsed, { cursorScope, cursorSecret }))
   ```

   The result of `buildListQuery` and `buildDerivedListQuery` is passed the same way. `buildDerivedListQuery` takes `anchor: { idColumn, table }` for rows of one table, where a sort value too long for a cursor is carried by reference, or `idColumn` and `idField` for rows of no one table; paginate's `keyset: "derived"` and `idField` are gone:

   ```diff
   - const built = buildDerivedListQuery({ ...sealed, idColumn: doc.id, parsed, sortColumns })
   - const [items, page] = queryHelpers.paginate(rows, parsed, { ...sealed, keyset: "derived" })
   + const built = buildDerivedListQuery({ ...sealed, anchor: { idColumn: doc.id, table: doc }, parsed, sortColumns })
   + const [items, page] = queryHelpers.paginate(rows, built)
   ```

   A list paged by hand, with no builder, takes its pagination from `queryHelpers.listOptions(parsed, options)` too. A parsed query the app writes itself, not one `schema.parse` returns, is passed with `sortOrderBy` beside `parsedSort`, and with `validated: true`, which says its sort and filter were checked; without it a sort is refused as a 500 `sort_not_wired`:

   ```diff
   - const [items, page] = queryHelpers.paginate(rows, { limit: 20, parsedSort: [{ direction: "desc", field: "created_at" }] }, sealed)
   + const parsed = {
   +   limit: 20,
   +   parsedSort: [{ direction: "desc", field: "created_at" }],
   +   sortOrderBy: { created_at: "desc" },
   +   validated: true,
   + } as const
   + const [items, page] = queryHelpers.paginate(rows, queryHelpers.listOptions(parsed, sealed))
   ```

   The call before 0.15 is refused as a 500 `page_not_wired` naming the built query, and so is a page of more rows than the query reads, one whose limit was not applied. A list ordered by a computed sort answers `nextCursor: null`, its next page by number still served. `applyListQuery` takes drizzle's select as it is, so `.$dynamic()` may go.

3. **Check the filters your clients send.**
   - A `like` or `ilike` value with a `*` inside it is capped at 50 bytes as SQLite reads the pattern, escaped (a `[` in a `like` is the three bytes `[[]`), and one past it is a 400 at validation that names its size. D1 refused it before only once it read a row. On a database without D1's cap, raise it: `validateFilter(filter, fields, { maxPatternBytes: 500 })`, or `limits: { maxPatternBytes: 500 }` on `createListQuerySchema`. A literal typed as a whole `FilterLimits` needs the new key.
   - An ISO date filter (`format: "iso"`) is the instant it names, typed as `toISOString()` text: `2024-01-01T01:00+01:00`, `2024-01-01T00:00Z` and `2024-01-01` (midnight UTC) are one instant. On a text column it compares with what the column stores, so a column that stores another spelling (`…T05:00:00Z`, or an offset) no longer matches `eq`, and its ranges shift, as `.` sorts before `Z`: rewrite stored ISO text to `toISOString()` form, or store the dates as epoch milliseconds. On a date or number column `filterToSQL` now binds it as the column stores it, where it answered `filter_not_wired`. Code that read the validated value back as the client wrote it gets the instant.
4. **Send canonical uuids to plain Postgres `uuid` columns.** A create or update DTO takes a `uuid` as `z.guid()`: braces and bare digits, which Postgres also takes, are a 400.
5. **Remove `multiTenant` and `promotionOrder` from `comb.migrate.config.ts`.** No command read either, so a config that set `multiTenant` migrated its one database and exited 0; it is now refused, naming the key, and `MultiTenantConfig` is no longer exported.
6. **Await `generateIncrementalMigration`**, which returns a Promise: it creates a non-public target schema on the dev database before Atlas replays there. A `readPgObjects` you pass to the CLI returns the new `LiveObjects`: `routines`, each routine by its name with its kind and each overload's input argument types (`signatures`), and `triggers`, each table's triggers by name with when and for what they fire (`type`, Postgres's `tgtype`) and whether they are `enabled`.
7. **Drop `d1Bookmark` from code that reads a `ShardMapping`.** It was the bookmark of whichever request filled the cache, and nothing read it; a mapping an older router left in KV is returned without it. The router's KV tombstone moves to `shard-inv:<orgId>`, and while one lives a mapping in KV is trusted only when tagged with its nonce. A 0.14.1 worker neither writes nor reads the new tombstone, so move or unplace no org until every worker sharing the KV runs 0.15; a tombstone 0.14.1 left blocks caching only until its TTL.
8. **Give the CLI's flags no value.** `--yes=false`, `--yes=no` and `--json=0` meant `--yes` and `--json`; they are now refused, so a script that meant to refuse should leave the flag out.
9. **Run `comb migrate check <db>` on every database.** More is rated: on Postgres, an added `serial`, identity or stored generated column (a rewrite), an inline `CHECK` or `REFERENCES` (a scan), an inline `PRIMARY KEY` nothing fills per row (unsafe), `SET GENERATED ALWAYS` and an identity added `ALWAYS` (cautious, as a deployed insert that writes the column then fails), `ALTER DOMAIN` as its column twin, and `VACUUM (FULL)`, a `REINDEX` that is not concurrent and `CLUSTER` (a lock), while a `serial NOT NULL` column is no longer unsafe; on SQLite, a rebuild that drops the table's triggers is unsafe; on D1, a dot-named file, files whose leading numbers order otherwise than their names, and a pending file ending inside a comment or without a final `;` are refused. Approve a file meant to do one with `-- comb:allow-unsafe: <reason>`.
10. **Expect baseline to compare more.** A SQLite baseline compares triggers, views and FTS tables; a Postgres one compares functions by their arguments and triggers by how they fire, and refuses an extra overload, other arguments, another timing or a disabled trigger. Adopting 0.12's shared history now needs proof, replayed on `devUrl`, so `devUrl` must reach its dev database.
11. **Check Postgres URLs that spell their server in the query.** `?port=`, `?dbname=`, `?host=` and `?user=` are read as libpq and Atlas read them where comb connects itself (baseline's live functions, the dev schema), so a URL that reached another server or failed there now reaches the one Atlas migrates; `sslmode`, `sslrootcert`, `sslcert` and `sslkey` set TLS as libpq does. An empty host is localhost over TCP, as Atlas's driver reads it; a socket is spelled `?host=/run/postgresql`, and one spelled as a percent-encoded host (`@%2Frun%2Fpostgresql`), which Atlas refuses, is refused before it runs. A password whose `%` escape is no UTF-8 is refused before Atlas runs.

## Migrate

- **Atlas's apply report is read one way** for a dry run and an apply: an apply that lost the lock to one that ran every file says "No migrations to apply", one that ran nothing while files are pending is refused naming them, a refused dry run shows the reason in Atlas's JSON, and a failed `-- atlas:txmode none` file says how many of its statements stay applied. Baseline's refusal and `migrate status` name the last applied version.
- **A file Atlas ran halfway** is no longer blamed for an earlier file's change: an earlier file edited, deleted or added since is named; a changed half-run file is told to restore it and fix what made its statement fail, as Atlas resumes it there.
- **A refused SQLite apply or baseline writes nothing**, comb's history table included, and **a retried apply runs a file once**: when a batch commits and its answer is lost, the retry finds the file recorded.
- **D1: a wrangler run that stops short reports what it applied**, recording the hashes of the checked files it ran; `--json` lists them in `applied`.
- **Postgres rating reads what Atlas sends**: a chunk's leading comments, a nested block comment among them, no longer hide a statement from the rating or a table it makes from the schema comb follows.
- **Secrets in Atlas's output are masked more exactly**: a socket target's password is masked, and a literal secret only where it stands as a token, so a password that is part of a table name leaves the name.
- **Postgres: a target schema that does not exist** is explained, with the `CREATE SCHEMA` to run once; comb creates a non-public schema on the dev database through the optional `postgres` peer.
- **Proof run**: a table renamed with a renamed column is named as renamed, and values a `DEFAULT` of now would exceed, and every nullable column left NULL, are seeded, so such tables are no longer left unproven.

## Query and errors

- **Merged paging**: a cursor page that ended on a null key no longer repeats rows from other shards, and two shards answering one id is `sort_not_wired`.
- **An anchored derived list sorted by an SQL expression** pages a long key by reference when the expression reads the anchor table's own columns alone; on any other expression a key too long for a cursor is a 500 on the page that meets it, never a cursor the next page refuses.
- **D1: a prefix or suffix filter binds its text once**, so the largest accepted request binds at most 80 parameters, as documented.
- **SQLite's "statement too long" is a query error**, not a 400; D1's pattern refusal is read from D1's own message, never a bound value; and D1's "Exceeded maximum DB size" is the 422 storage limit a full disk gets.
- **A time zone offset past 15:59 is a 400 `invalid_value`**, by every write path, and the `timetz` and `timestamptz` write DTOs refuse it first.
- **A read DTO takes a stored float's `Infinity` and `-Infinity`**, which JSON writes as `null`, and the `null` D1 hands one back as; its published schema takes that `null` (`anyOf: [{ type: number }, { type: null }]`); on Postgres a stored `NaN` still fails it, as JSON Schema cannot represent one.
- **Postgres: an expression unique index names no column**; `PgErrorRead.keyExpression` says the key held one.

## Codegen

- **Each `c.json` schema is imported under a name of its own**, so two modules' same-named schemas no longer collapse into one; one named as a generated file's own name is aliased.
- **Integer bounds that leave no integer fail codegen**, naming the column, and an integer's example stays inside fractional bounds.
- **`c.enum` takes `private`, `nomutate` and `tenant`** beside its state machine, and a misspelled machine key fails codegen naming the column.

## New

- `refoldStatements(table, column, sources)`, from `@workerstack/database/query/sqlite`: the backfill of a `_search` column, writing only rows whose fold changed.
- `combDatabaseErrorKeys` and `CombDatabaseErrorKey`, from the package root: the keys the database classifiers answer with.
- `contains` runs on SQLite, as a member of the JSON array a column holds, a plain `text()` column's included; a scalar JSON value is no array, and matches nothing.
- The entity stamp's `partialUniqueIndexes` (meta-contract.md §6.8) and the query stamp's `maxPatternBytes`, optional facts within v1.
- `page_not_wired`, a new error key.
