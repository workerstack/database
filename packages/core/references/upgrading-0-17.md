---
description: Upgrading to 0.17
order: 250
---

# Upgrading to 0.17

What changes for a project on 0.16. Before deploying it:

1. **Regenerate, and widen what codegen refuses.**
   - A text whose bounds leave no value once comb's own are counted fails codegen, naming the column: a `password` with a `min` past 72, a required text with `max: 0`, a `url` with a `max` under 9. 0.16 wrote a `_shared` module that threw on import, or a DTO that refused every value. A text declaring both `lowercase` and `uppercase` fails too ("lowercase and uppercase contradict; declare one"), where lowercase won without a word.
   - A written text with `trim`, `lowercase` or `uppercase`, and every written email, publishes `"x-comb-transform": [...]` in its JSON Schema, in the order applied, on the non-null branch of a nullable field. Its published bounds and pattern bind the transformed value, so a client that validates from the spec applies the transforms first (meta-contract §2.1, §6.9).
   - A nullable written `c.json` publishes one flat `anyOf: [<schema>, { type: "null" }]`, its `x-comb-*` keys beside it, where 0.16 nested a one-member `anyOf` inside the nullable one. A registered schema with `maxBytes` publishes its bare `$ref`, where 0.16 inlined its body beside it; the byte limit and the U+0000 rule are one check, each still its own issue. A consumer that matched the nested shape reads the flat one.
   - Generated DTOs name `Array`, `Set` and `undefined` as `globalThis.Array`, `globalThis.Set` and `void 0`, so a schema module exporting a value of a global's name no longer breaks a multi-dimensional array's write. `_shared`'s `_m` is `as const`.
   - The constraint map keys every table, one with no constraint as `table: {}`, and lists a Postgres table's partitions under `partitions` from `comb.config.ts`'s new `partitions: { parent: ["partition", …] }` (step 2).
   - `comb.config.ts` refuses an FTS table with no column, at its path. Under `isolatedDeclarations`, the constraints, entities, enum-checks, error-keys, field-names, rows, rqb-cols, sql-cols and table-names files compile; the DTO files, `_shared`, relations and orm do not, so keep those in a tsconfig without the flag.

2. **Key every table your errors should name.** A violation on a table the maps given key nowhere names no column, in its `column` or its cause, on every dialect, as on Postgres since 0.16: a table a trigger writes outside the schema, say. Regenerated maps key every table of the schema. Tables your app creates at run time take a prefix pattern beside the generated map, and are named again:

   ```diff
   - onError: (error) => sqliteErrorHandler(error, [DB_CONSTRAINT_MAP])
   + const MAPS = defineConstraintMaps({ ...DB_CONSTRAINT_MAP, "ut_*": {} })
   + onError: (error) => sqliteErrorHandler(error, MAPS)
   ```

   A key ending in `*` keys the tables it prefixes, the longest pattern winning and a table's own key over any; a `*` anywhere else is a `TypeError`. On Postgres, a violation reported on a partition is read as its parent's only when the parent's entry lists it under `partitions`; 0.16 read any table no map knew as the statement's own, which named a private column under the wrong table when a trigger wrote it. A partitioned table lists its partitions in `comb.config.ts` (or a hand-written map adds `partitions: [...]` to the parent's entry), or its partitions' violations name no column.

3. **Expect new answers from the error handlers.**
   - A bare `SQLITE_CONSTRAINT` whose words name no kind is a 400 `constraint_violation` with the generic cause "Constraint violated"; only a trigger's RAISE (`SQLITE_CONSTRAINT_TRIGGER`, which libsql, bun:sqlite and D1 all report) shows its own message.
   - libsql's `batch()` classifies as `execute()` does: a STRICT mismatch through it is the 400 `invalid_value`, where it was a `constraint_violation` whose cause held the engine's text and the column.
   - On D1, an FTS5 table's duplicate rowid through `exec()` is the 409 `primary_key_violation` that `prepare()` and `batch()` give.
   - On libsql and Turso, a refused or lost connection (`ECONNREFUSED` and the codes Postgres reads, `HRANA_WEBSOCKET_ERROR`, an idle stream sqld expired, `STREAM_EXPIRED`) and a `SERVER_ERROR` whose response was a 5xx or a 429 are the 503 `database_unavailable` that D1 and Postgres give. A host that does not exist and a request the server refuses stay unclassified.

4. **Check your lists.**
   - A list schema brands its limit (`limitBounded`) as it brands its page: a hand-built `limit` past `PAGINATION_DEFAULTS.maxLimit` (100) is a 400, as a hand-built page past `maxPage` is. Page a hand-built list within 100, or set `limitBounded: true` on it to assert a bound of your own, as `pageBounded` does for a page.
   - `paginate` and `paginateMerged` return `Array<Omit<T, ListExtra>>`: code that read `_total` or `_combId` off an item, always undefined at run time, no longer compiles. Each extra is held to its kind: `_total` a safe integer from 0 (a bigint taken as its number), `_combAnchorGone` 0, 1 or a boolean, `_combId` never the string `"_combId"`; anything else is a 500 `page_not_wired` naming the raw-SQL form.
   - `buildDerivedListQuery` takes `merged: { maxRowsPerShard? }`, as `buildListQuery` does, for a union or join whose rows sit on several shards; page it with `paginateMerged`. A merged derived list takes `idColumn`, not `anchor`, and its rows carry each sort field under its name.
   - A merged list refuses, as `sort_not_wired` (500), a computed sort and a table with no id column when it is made, and in `paginateMerged` a rows' sort field missing or an integer sort key a driver read as a number past ±(2^53 − 1); read such a key as bigint. A `merged.maxRowsPerShard` that is not a whole number from 1 is a `TypeError`. A cursor whose anchor row is gone and whose integer key is past 2^53 resumes from the edge of the key's rounding interval, skipping no row.
   - `buildFilterSQL`'s `columnMap` takes `{ column, kind }` only: write `name: "name"` as `name: { column: "name", kind: "as-is" }`, which binds as the string form did. JavaScript that passes a bare name gets a `TypeError` naming the field.
   - `buildFtsWhereWithSpellfix` falls back to the terms as typed only when SQLite says spellfix1 is not loaded; a missing or misspelled spellfix table and a transient driver error are thrown.

5. **Check your configs at load.**
   - The `turso` provider requires `databaseName`, the Turso database's own name, as D1's does; 0.16 took the environment's `name`, which defaults to its key, so it could create a database called "prod". A Turso provider without it is refused at load.
   - `comb.migrate.config.ts` refuses an empty or blank `drizzleConfigPath`, an environment keyed by the empty string, an empty `databases` and a `lockTimeout` Postgres would not take; `migrate diff` refuses a `drizzleConfigPath` that is a directory. An empty postgres `devUrl`, libsql `url` or turso `apiToken` loads, and the command that resolves that environment refuses it by name.
   - `lockTimeout` is read as Postgres reads `lock_timeout`, once: a value past 2147483647ms, or one that rounds to 0ms, is refused; Atlas gets it in milliseconds, rounded half to even; a unitless fraction is milliseconds.
   - comb's own Postgres reads (baseline's catalog read, the dev-schema create) require TLS where the URL names no `sslmode`, as Atlas's driver does: a server without TLS takes `sslmode=disable`. They take the password from the URL's `passfile` when it gives none, as libpq does, matching a line's host to the host given, else the `hostaddr`; a passfile others can read is refused. Every Postgres command refuses an `sslmode` libpq does not take, or a TLS file it cannot read, naming the field. The plaintext-password warning judges the address connected to, `hostaddr` first.

6. **Re-check pending migrations.** Run `comb migrate check` on each environment before applying; ratings changed.
   - bun:sqlite applies with `PRAGMA foreign_keys = ON`, as libsql, D1 and the proof do: a file that relied on them being off now cascades or fails. `PRAGMA journal_mode` is refused, with no override; set it outside the migrations.
   - A refused libsql or bun:sqlite apply or baseline creates no database file. A D1 batch past 100 KiB runs as consecutive `--command` calls, never D1's import API; one statement past 100 KiB is refused before wrangler runs.
   - Postgres: a retype to or from an array is never a widening, and a widening retype that changes the column's collation rebuilds its indexes. An added column rates its domain's default, and an operator or cast as its function. An index or materialized view moved, and `ALL IN TABLESPACE`, warn of their rewrite. A new partition's lock warning names the parent's default partition. A foreign key's warning names the tables it scans and says to add it `NOT VALID`, then `VALIDATE CONSTRAINT`. `ENABLE` and `DISABLE RULE` read the rule family's rule; `LOCK` and `REFRESH MATERIALIZED VIEW` are rated by their lock alone. A `CASCADE` drop takes its dependents out of the history's facts; a trigger on a view, or an `ALTER TABLE` naming one, is about that view; what a view or policy reads comes from its parse tree. A statement two readings rate is listed once, its notes joined by "; ".
   - A Postgres baseline compares domains, composite and range types, rules, collations, the extensions the history creates, each table's row level security, a policy's command, roles and kind (a policy to `CURRENT_USER` as the role baseline connects as), and a sequence's settings. A database that lacks one refuses; it warns on every run of what it does not compare.

7. **Await `generateSchemaDiff`.** It is async (`/migrate`) and, on Postgres, readies the target's dev schema first, as `migrate diff` does; a dev database that is not empty is explained with comb's `devUrl` message.

8. **The CLI.** Every command refuses a positional it does not read, with its usage line: `migrate init postgres` (meant `--dialect postgres`) no longer drops a word. Wherever `--json` appears, a refusal on any command prints the one JSON object (`{ applied: [], database: null, pending: [], refused: [...] }`). `/cli` type-checks in a project with Workers' and Node's types and no DOM.

9. **Know what was added.** New exports: `parseConfig`, `DatabaseMissing` and `TursoMissing` (`/migrate`). A program that imports its config module calls `parseConfig(imported)` (or `loadConfig(path)`) to have it checked, as `defineConfig` only types it.
