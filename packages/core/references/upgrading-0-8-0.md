---
description: Upgrading to 0.8.0
order: 360
---

# Upgrading to 0.8.0

0.8.0 closes the findings of a fresh review of 0.7.0. It is a breaking minor; what changes for a project on 0.7:

**Migrations**

- **D1 history moves to wrangler.** `comb migrate apply` on D1 checks the pending files (order, classification, approval), then hands them to `wrangler d1 migrations apply`, so the history is wrangler's `d1_migrations`, ordered by numeric prefix, then name. A database wrangler already migrated needs nothing; one comb 0.7 migrated through `__drizzle_migrations` takes a one-time `comb migrate baseline <db>`, which copies that history. The D1 provider takes `wranglerConfig` and `wranglerEnv`, and `--file` is refused on D1. `wrangler` (`>=4.147.0`) and `drizzle-kit` (`>=1.0.0-rc.4`) are optional peers: install the one your provider uses.
- **Baseline compares before it records.** On libsql, bun-sqlite and Postgres, `baseline` records the history only when the live database matches what it leaves; on Postgres the compare covers tables (Atlas OSS inspects no view, policy or sequence).
- **Row level security is comb's.** The first 0.8 Postgres diff enables row level security on every table with policies, which Atlas OSS dropped without a word, so rows disappear for roles that do not bypass RLS. Grant `BYPASSRLS` or write the policies those roles need before you apply it.
- **Rebuilds are guarded.** A SQLite table rebuild that cascades to other tables keeps their rows (comb copies and restores them) and rates the file unsafe. The first 0.8 diff of a history comb 0.7 wrote from a raw drizzle-kit rc.4 export rebuilds its text-primary-key tables once, since comb now adds the `NOT NULL` the export left out.
- **More is gated.** `PREPARE`/`EXECUTE`, `setval`, rule actions, `COPY FROM`, `REASSIGN OWNED` and writable pragmas are unsafe or cautious, `OWNER TO` is cautious, and `CREATE INDEX CONCURRENTLY` or `VACUUM` outside `-- atlas:txmode none` is refused.
- `migrate diff --dry-run` prints the migration without writing it, and `migrate check` runs the apply checks alone.
- A file `diff` writes always sorts after the history: one Atlas stamps in the same second as, or before, the latest file (two diffs in one second, a teammate's clock ahead) is renumbered a second past it.
- Removed: `applyMigration`, `verifySchema`, `createBackupTables`, `cleanupBackupTables`, `generateMigrationFile` and `GenerateMigrationOptions`. `applySqliteMigrationTransforms(sql, before?, fts?)` takes the schema the earlier files leave and the FTS state.

**Queries**

- `RelationConfig` is `{ sourceKey?, target, targetKey, through, throughSourceKey, throughTargetKey }`: `throughKey` is split into the junction's two keys, and every key is a column's property name. Relation filters work again.
- `buildFtsWhere({ table, ftsTable }, q)` and `buildFtsWhereWithSpellfix({ table, ftsTable, spellfixTable, … })` match by rowid; `idColumn` is gone.
- `DEFAULT_SORT` is no longer exported, and `sort: []` orders by the tiebreak alone. `sortToOrderBy` and the JSON helpers of `sqlite/sql` (`jsonCol`, `jsonColAs`, `jsonBool`, `jsonNullable`, `buildScalarJsonParts`) are removed.
- A cursor from another sort is refused, a date filter binds a `Date` on date columns, and a number on a text column is refused.

**Errors**

- A composite unique violation reports its columns together, under the codegen key `<table>_<a>_<b>_duplicate`. Deleting a row others still reference reports "The record is still referenced by other records", with no column.
- On Postgres, `53300`, `53400`, `57P01`, `57P05` and `25P03` map to unavailable, and `55P03` to retry.
- Error text that carries a `params:` line (0.4.x's flattened cause chain) is no longer classified: a bound value may hold a newline and write the engine's words itself. Pass the error object, whose cause chain comb reads safely. A `DELETE` behind a `WITH` clause or a comment is read as the delete it is.

**Codegen**

- Each database gets only the tables its tables file declares (and the files it re-exports), and its imports resolve from wherever its output lands.
- When one package.json exports two databases, every subpath is namespaced by database: `./core/dtos/post`, `./audit/entities`. A package with one database keeps its subpaths.
- Columns and DTO files take the database's file prefix (`db.<name>.…`); direct mode (`--tables`) writes no package exports.
- A one-relation is named from its SQL column (`author_id` or `authorId` gives `author`), with `Relation` appended when a column already holds the name.
- Create and update DTOs leave out what comb or the database fills: `autogenerate` columns (the timestamps by default) and generated keys (`c.id`, `c.serialId`, `autoIncrement`, defaulted keys). A client can no longer choose an id or backdate a row.
- An integer foreign key gets an integer schema; a read DTO accepts a negative integer; `maxBytes` counts UTF-8 bytes. FTS DDL and generated keys quote what is not a plain identifier.
- The Postgres `c` takes the SQLite parameters: `text(name, constraints?)`, `integer(name, constraints?)`, `json(name, schema, constraints?)` and constraints on every timestamp; `pg.json<T>(name)` becomes `pg.json(name, schema)`. Constraints accept `private`.
- A hand edit to a generated file is put back on the next run, whatever its header says.
