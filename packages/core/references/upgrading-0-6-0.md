---
description: Upgrading to 0.6.0
order: 390
---

# Upgrading to 0.6.0

0.6.0 closes the 0.5 review's findings. Four changes break callers:

- **State machines.** `assertTransition(machine, from, to)` takes three arguments. Name the column on the machine (`defineStateMachine({ column: "status", … })`) instead of passing it fourth.
- **Trusted list input.** `buildListQuery()` and `queryHelpers.listOptions()` refuse a `filterAst` or `parsedSort` without `validated: true` (`filter_not_wired` / `sort_not_wired`, 500). `createListQuerySchema()`'s output carries the flag, and it survives a framework that hands handlers the schema's output, as honey's `c.input.search` does. Code that builds a parsed query by hand, after checking the filter against its own fields, sets `validated: true` itself.
- **Postgres migrations.** The `postgres` and `neon` migrate providers are refused at load, and `createPostgresProvider`, `createNeonProvider`, `introspectPostgresSchema`, `getPostgresTables`, `getPostgresColumns`, `getPostgresIndexes`, `PostgresProviderConfig` and `NeonProviderConfig` are removed: they only ever threw. Run Postgres migrations with `drizzle-kit migrate`. The Postgres runtime modules are unchanged.
- **Keyset SQL.** `keysetSQL({ id, keys, tiebreak, values })` takes one `KeysetPosition` object instead of four arguments.

Fixes that change what a caller sees:

- **Error classification.** SQLite, D1 and Postgres errors are read from the innermost error out, so a wrapper whose message or bound params look like a constraint, storage-limit or SQLSTATE error no longer decides the class. A failed query is no longer reported as a constraint violation because a parameter says so.
- **Query layer.** A `select` nested deeper than eight levels is a 400 with the new key `invalid_select`, and parsing is linear in its length. A `Record<CombErrorKey, string>`, such as a message table, needs an `invalid_select` entry. A `(` in an unquoted filter value is a malformed filter, as a `)` already was; quote the value to match one.
- **D1.** `BookmarkTracker.track()` takes the `session` `openD1Session()` returns, `undefined` included, and tracks nothing for `undefined`. `ShardRouter` takes any KV with the three calls it makes (`ShardKv`), so a Worker's global `KVNamespace` fits.
- **Codegen.** Config mode names a database as the config does (`core`, not `db` for `src/db/core.tables.ts`), which renames its generated maps and diagrams. Generated subpaths are never written into a `package.json` above the project root. Temporary files of atomic writes are named with `randomUUID`.
- **Meta.** The manifest no longer lists unique indexes over private columns, matching the stamp.

New: `createUlidFactory()` for ULIDs that strictly increase, even through a clock that steps back. `KeysetPosition` is exported from `@workerstack/database/query/sqlite`. The package's declared types are checked under `isolatedDeclarations` and every strict flag a consumer may set. That covers comb's own shipped types: the generated files (DTOs, relations, enum checks) and your drizzle tables module are your app's code, which `isolatedDeclarations` would flag for their inferred types, so keep them out of a project that sets it.
