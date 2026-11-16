---
description: Upgrading to 0.10
order: 340
---

# Upgrading to 0.10

0.10 closes the findings of a fresh review of 0.9.1. It is a breaking minor; what changes for a project on 0.9:

**Migrations**

- **A proof runs before `check` and `apply`** on bun:sqlite, libsql and D1: each pending file runs on an in-memory copy of the live schema, seeded with rows, and a lost row, a lost column or a value changed, copied or moved makes it unsafe. The target is only read. The classifier stays authoritative; a passing proof never relaxes it.
- **More is unsafe**: a trigger is rated by its body, a call by its routine's body, a write to a rebuild's copy before the rename, an affinity-changing rebuild, `ON CONFLICT` and `STRICT` drift, `DO INSTEAD NOTHING`. A restrictive or `FORCE` row level security policy is cautious.
- **An empty target** (no table of its own) on the SQLite family applies a history with unsafe files, saying "empty target"; Postgres is unchanged.
- `check` and `status` read the database read-only on every engine; `check` skips Atlas's dry run when nothing is pending.
- comb no longer rewrites `CREATE INDEX` and `DROP INDEX` to `IF [NOT] EXISTS`: each file applies as written. A history that relied on it fails where an index already exists; run every history from empty before upgrading.
- SQLite table names compare case-insensitively, as SQLite does.
- `migrate init` scaffolds no `atlas.hcl`; delete one an earlier `init` wrote, as no comb command reads it.
- `ExtractedSchema` gains `externalFts`, and `TableInfo` gains `affinity`, `conflicts` and `strict` (all required).

**Query layer**

- **Cursors are signed.** `createCursor`, `readCursor`, `queryHelpers.listOptions`, `queryHelpers.paginate`, `buildListQuery` and `buildDerivedListQuery` take a required `cursorSecret` of at least 32 UTF-8 bytes: give every worker the same `CURSOR_SECRET` and pass it at the call. A cursor 0.9 minted is `invalid_cursor` after the upgrade, so a client on page 2 starts over. `decodeCursor` is removed; use `readCursor`. `encodeCursor` is no longer exported from `@workerstack/database/query`.
- The cursor cap is 8192 characters (`MAX_CURSOR_LENGTH`), and `paginate` throws `sort_not_wired` rather than mint a longer one.
- A number past ±2^53−1 in a filter is a 400.
- `page` runs to `pagination.maxPage` (10 000 by default, published as `maxPage`); page further by cursor.
- An `extend` key the schema owns (`cursor`, `filter`, `filterAst`, `lang`, `limit`, `order`, `page`, `parsedFields`, `parsedSort`, `q`, `select`, `sortOrderBy`, `validated`) is a type error and a `TypeError` at construction.
- `createRetrieveQuerySchema` is strict, and takes `lang` only with `lang: true`.
- A derived sort key that yields epoch milliseconds is declared `{ sql, type: "date" }` in `sortColumns`.
- FTS searches every word and character of a term, `AND`, `OR` and `NOT` included; a term with no letter or digit is skipped.
- **`_search` columns**: write them with `searchText(...)` and backfill existing rows with it, since `likeSearch` folds each term the same way (NFKD, lowercase, Latin diacritics, the Latin letter folds). `likeSearch` takes an SQL expression too.
- `paginate(rows, query, { cursorSecret, idField })` pages rows keyed by another field.

**Errors**

- New keys: `CONSTRAINT_VIOLATION` (a trigger's `RAISE`, P0001 on Postgres), `CURSOR_NOT_WIRED`, `EXCLUSION_CONSTRAINT_VIOLATION`, `VALUE_TOO_LARGE`. A `Record<CombErrorKey, string>` of translations needs them.
- A value a column cannot hold is the same 400 on every engine: SQLite's STRICT mismatch and a value too big, which were 500s, are now `invalid_value` and `value_too_large`.
- `ConstraintMap` gains `exclusion` for Postgres `EXCLUDE` constraints; a unique index on an expression is keyed by its name on SQLite too.

**D1**

- `openD1Session(d1, bookmark)` is now `openD1Session(d1, { bookmark, constraint })`, and a session without a bookmark opens on the primary (`first-primary`). Pass `{ constraint: "first-unconstrained" }` where a read may lag.

**Codegen**

- Create DTOs take no timestamps, and a natural key named `id` is required on create.
- An integer takes one range on every DTO, its declared bounds clamped to the column's; a count that may not go negative declares `{ min: 0 }`.
- On Postgres, writes refuse U+0000 in text and JSON.
- A text reference keeps its declared bounds; `imageUri` and https rules publish as patterns; examples meet their bounds, and a field with a `pattern` has none.
- A database name becomes identifiers camel-cased (`my-db` gives `MY_DB_…` and `createMyDbDb`); one that makes none fails the run.
- The run record moves to `.comb.codegen.json` beside `comb.config.ts`; the first run reads the old `.<prefix>.codegen.json` once and removes it. Commit the new file.
- A failing database writes nothing for any database.
- Tables whose generated paths differ only in case fail the run; a database holding both Postgres and SQLite tables fails it.
- A many relation whose name a column or a one relation of its table already holds takes a `Relation` suffix: `posts` becomes `postsRelation`, so a query's `with: { posts }` becomes `with: { postsRelation }`. Drizzle's `unique()` and a named `.unique()` reach the constraint map and the published `uniqueIndexes`; diagram SQL quotes every identifier; the FTS map lists SQL column names.
- A CHECK written `check("name", sql.raw("…"))` reaches the constraint map; a `check()` codegen cannot read fails the run. Regenerate, then translate the new error keys.
