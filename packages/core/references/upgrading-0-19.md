---
description: Upgrading to 0.19
order: 230
---

# Upgrading to 0.19

What changes for a project on 0.18. Before deploying it:

1. **Know what changed in the API.** A test holds these three lists to the exports themselves.

   New exports: none.

   Removed: none.

   Changed: `MANIFEST_VERSION`, `ManifestColumn`, `SpellfixDb`, `SpellfixSearch`, `buildManifest`, `defineConfig`.

   `buildManifest(tables, dbName, dialect)` takes the dialect, which decides what a column holds, as the DTO's does. `defineConfig` also takes a function, sync or async, that returns the config, and returns what it was given, so a config that reads its secrets asynchronously is typed too; an object passes as before. `buildFtsWhereWithSpellfix` keeps its spellfix1 probe per client, read from `SpellfixDb`'s optional `$client` (a drizzle database has it), so a wrapper built per request asks once; `SpellfixSearch` takes `spellfix: false`, which asks nothing and searches the terms as typed (D1). Both are additive.

2. **Regenerate, and widen what codegen refuses.**
   - The manifest is `v` 2: each column's `min` and `max` are the bounds the create DTO enforces, not the declared ones (a password's 8 to 72, a required text's 1, a format's floor, an id's 1 to 48, an integer's clamped to the column), `patterns` lists every regex it checks, the kind's own beside the declared one, in place of `pattern`, and `maxBytes` is a `c.json` column's byte limit. A reader of `v` 1 refuses it; read `patterns`, then regenerate committed manifests (meta-contract §8.2).
   - A Postgres read array of a bounded text, integer or real states its element's `x-comb-*` bounds on every level's `items`, where 0.18 left them inside the first `anyOf` member of each, as meta-contract §2.1 says. A reader of `items["x-comb-*"]` finds them; regenerate.
   - An entity file imports `jsonValueSchema`, `cidrSchema` or `timestampSchema` only where a field uses it. 0.18 imported one whenever a field's code contained the name, so a `c.json` schema exported as `jsonValueSchemaStrict`, `cidrSchemaDoc` or `timestampSchemaDoc` made the file fail a consumer's `noUnusedLocals`; regenerate.
   - A nullable plain json or jsonb column's read publishes null once: `z.json()` holds null, and 0.18 added a second `{ type: "null" }` beside it. The type is unchanged; regenerate.
   - A password's declared `max` past 72, bcrypt's limit, fails codegen naming the column; 0.18 held the column to 72 whatever it declared. **Fix:** declare 72 or less, or drop the `max`.
   - A nullable field's `x-comb-*` keys sit on its non-null member too, with the same values, so a schema composed from it with zod's `.unwrap()`, `.optional()`, `.pick()` or `.extend()` keeps them. 0.18 put them on the nullable alone, so `.unwrap()`, the usual way to take a nullable column as a required input, dropped its transform and storable-text keys. A reader still reads the property's keys (meta-contract §2.1); regenerate.

3. **Move the peers inside the new ranges.**
   - `drizzle-orm` and `drizzle-kit` admit `1.0.0-rc.4 || 1.0.0-rc.5 || ^1.0.0`. 0.18's `>=1.0.0-rc.4 <2` admitted the tagged 1.0.0-rc.5, drizzle's `rc` tag, which failed strict `tsc` in comb's D1 sharding types; 0.19 type-checks on rc.4 and rc.5 both. It also admitted drizzle's `1.0.0-rc.N-<hash>` branch builds, which rank above the tagged rc, and the README's install line resolved drizzle-orm's `latest` tag, 0.x, outside the range. **Fix:** install a tagged release inside the range: `drizzle-orm@1.0.0-rc.4` or `@1.0.0-rc.5`, and `drizzle-kit` at the same version where installed.
   - `@cloudflare/workers-types` starts at `5.20261001.1`, the floor wrangler 4.147.0, comb's wrangler floor, peers on; 0.18's floor of `5.20260815.1` could not install beside it. **Fix:** move to `5.20261001.1` or later.

4. **Rename a migrate config by a retired name.** comb reads only `comb.migrate.config.ts` and `comb.migrate.config.js`. 0.18 also read `db-migration.config.ts`, `migration.config.ts` and their `.js` twins, names other migration tools use, and ran such a file as code. A project with one of those and no comb config now fails every `comb migrate` command without running it, naming the file. **Fix:** rename it to `comb.migrate.config.ts` if it is comb's; if it is another tool's, add a `comb.migrate.config.ts` beside it.

5. **Point a Postgres baseline with other statements at a `postgres://` devUrl.** On a `docker://` devUrl, baseline goes ahead without comb's replay only when every history statement is one comb has proved makes nothing it compares, and refuses any other, naming devUrl. 0.18 passed any statement not on a list of those that make such objects, so `ALTER SEQUENCE … OWNED BY NONE`, which frees a serial's sequence, passed the gate and then refused the very database the history built, as drift. A history with an `ALTER … OWNER TO`, `SET SCHEMA`, `CREATE STATISTICS`, `ALTER DEFAULT PRIVILEGES` or any other statement outside the list now refuses there. **Fix:** set `devUrl` to a `postgres://` scratch database comb can connect to, where it replays the history.

6. **Grant CREATEDB to the role of a `postgres://` devUrl.** `check` and `baseline` replay the history as Atlas applies it, each file in a transaction of its own, in a database they make from `template0` on devUrl's server and drop after. 0.18 replayed the whole history in one transaction on devUrl's own database, which filled Postgres's lock table on a long history, left a seed's deferred trigger events pending, and let what that database held decide the verdict. A history that creates a role devUrl's server lacks needs CREATEROLE too. A role without either is refused, naming the privilege. **Fix:** `ALTER ROLE <role> CREATEDB` for devUrl's role, with `CREATEROLE` when the history creates a role, or point devUrl at a role that has them.

7. **Move an `ALTER SUBSCRIPTION … SET (failover)` into a `-- atlas:txmode none` file.** Postgres 17 runs it only outside a transaction block, and `check` now refuses it anywhere else, naming it as Postgres does. 0.18 rated it a statement comb does not recognize, to approve in the file, and Atlas's file transaction then refused it at apply.

8. **Take `PRAGMA query_only` out of a SQLite or D1 migration.** `check` refuses it with any value, however it is written (`'1'`, `01`, `"on"`, `0`). 0.18 refused only the values it read as on, so `'1'` and `01` passed `check` and the file failed read-only at apply. Off does nothing on a connection comb opens, so no file loses anything. A pragma's single-quoted value is read as SQLite reads it, so `PRAGMA defer_foreign_keys = 'on'` is rated as comb writes it. `PRAGMA foreign_keys` other than on, yes, true or 1, in any case and quoted or not, gets the cautious note that it does nothing inside the transaction comb runs each file in: SQLite reads a word it does not know (`'nope'`, `full`) as off, and SQLite versions read a number like `256` apart. 0.18 noted only `off`, `false`, `no` and `0`, and rated any value but on, off, true, false, 0 and 1 unsafe. **Fix:** write `on` where a file means on.

9. **Read `unknown` in a `--json` report.** Every `migrate apply`, `check` and `status` object gains `unknown`, the files that may have committed, `[]` when none. On libsql, Turso and bun:sqlite, a file whose batch committed while its answer was lost, the connection staying down through every retry, is in `unknown`, in neither `applied` nor `pending`, and its refusal names the file and the cause (`fetch failed: read ECONNRESET`) and says to run `comb migrate status`; 0.18 listed it as pending. On D1, a read-back that fails after wrangler's apply puts the files it ran in `unknown` too, where 0.18 listed them as pending.

10. **Leave D1's new `_comb_migration_hash_intents` table to comb.** Apply on D1 writes each checked file's hash there before `wrangler d1 migrations apply` runs, and moves it to `_comb_migration_hashes` once wrangler's table names the file. 0.18 wrote the hash itself first, so when wrangler then ran nothing, the row outlived the apply, and every later command refused a file fixed and applied by wrangler alone, as applied and then as edited. The first apply that writes an intent makes the table; `d1HistoryTables()` lists it, and comb's own schema reads leave it out, as they do its other history tables. **Fix:** a hand-written list of comb's tables that a schema tool skips adds it; one built from `d1HistoryTables()` needs nothing.

11. **Drop a tsconfig mapping into comb's source.** A consumer's `tsc` now reads comb's declarations, so it needs no flag and no longer checks comb's internals. A `paths` entry or a `customConditions` mapping that sends `@workerstack/database` to its `src` bypasses them and keeps the 0.18 behavior, `allowImportingTsExtensions` and all. **Fix:** remove the mapping; `allowImportingTsExtensions` can go too, unless your own imports end in `.ts`.
