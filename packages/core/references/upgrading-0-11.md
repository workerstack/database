---
description: Upgrading to 0.11
order: 330
---

# Upgrading to 0.11

0.11 closes the findings of a fresh review of 0.10. It is a breaking minor; what changes for a project on 0.10:

**Migrations**

- **Ratings are default-deny.** comb rates only the statement shapes it recognizes (tables, indexes, views, virtual tables, schemas, sequences, types, domains, extensions, comments, `ALTER TABLE` actions it reads, the drops it rates, grants, writes, `SET`, the two foreign-key pragmas, transaction control, maintenance). Every other statement is unsafe and named "comb does not recognize …; approve it in the file": triggers, functions, procedures, rules, `DO` blocks and other pragmas among them. comb's own FTS sync triggers stay recognized. Run `comb migrate check` on every pending file before upgrading, and approve each one a person has reviewed with `-- comb:allow-unsafe: <reason>`; applied files are never re-rated.
- Policies (`CREATE`, `ALTER`, `DROP POLICY`) and row level security changes are recognized and cautious, naming whose rows change on which table, so `--yes` applies them.
- A trigger the history left makes a write it fires on unsafe; a `TEMP` table that shadows a real one, a `CAST` in a rebuild's copy that is not text into text, and a call of a routine the history made inside an `ALTER TABLE` are unsafe.
- The proof run retries a file the copy refuses once on a reseeded copy, seeds distinct values and mixed-case parents, and meets common `CHECK` shapes; the live guard's reason comes first.
- `__drizzle_migrations` gains a `name` column, added on the first apply; a file applied under one hash and edited since is refused by `apply`, `check` and `status`. `recordMigrationHash` takes an optional name.
- A Postgres `check` of a database with tables and no history fails with apply's baseline message, without the dry run.
- A migrate config exported as a plain object is validated as `defineConfig` validates it; an invalid one that used to load is refused, naming the file.
- Turso `check` and `status` create no database and read with a one-hour read-only token. `_cf_` tables are reserved on D1 alone.
- A migrate database whose tables live under another name in `comb.config.ts` says so with `codegen: "<name>"`; `diff` takes the migrate name, as `apply` and `check` do.
- `ExtractedSchema` triggers gain `events` and `ftsSync`, and `TriggerEvent` is exported.
- `Connection.executeEach` is gone: the live guard reads every foreign key in one query, one wrangler call on D1.

**Query layer**

- **Cursors are sealed and scoped.** A cursor is encrypted (XChaCha20-Poly1305 under a key HKDF-SHA256 derives from the secret), so a client reads none of its values, and it is bound to a required `cursorScope` beside `cursorSecret`: the list's route and tenant, such as `` `members:${orgId}` ``. `createCursor`, `readCursor`, `queryHelpers.listOptions`, `queryHelpers.paginate`, `buildListQuery` and `buildDerivedListQuery` take it; an empty one is a 500 `cursor_not_wired`. Every 0.10 cursor is `invalid_cursor` after the upgrade, once, so a client on page 2 starts over.
- The list schema takes any cursor string, and `readCursor` refuses every one it cannot use, malformed, over-long or minted under another order included, with `invalid_cursor`. `cursorProblem` takes the cursor alone; `verifiedCursor` is `openCursor`. The published `CURSOR_EXAMPLES` changed.
- A cursor fits what the driver returned: a bigint on a number column (libsql's bigint mode, bun:sqlite's `safeIntegers`), epoch milliseconds on a key declared as time. ±Infinity and NaN page as themselves.
- A sort value too long for a cursor goes by reference, the keyset reading it from the row. A `buildDerivedListQuery` list passes `keyset: "derived"` to `paginate`, and gets a 500 on the page that meets such a value. `CursorValue` includes `CursorRef`.
- A Postgres `timestamp` that may hold `'infinity'` is read in string mode: drizzle's date mode reads it as 2000-01-01.
- `filter` is capped at 4608 bytes, `q` at 600, `order` at 200 and `select` at 500, however a URL or a form encodes them (`REQUEST_BYTES`), beside their character caps.
- A page no schema validated is refused past 10 000 with the new key `page_too_deep`.
- `buildFilterSQL`'s `columnMap` takes `{ column, unit: "s" }` for a date stored in seconds.
- **`_search` columns change format**: Greek final ς folds to σ, the marks that make й, ї and ё letters of their own stay, and the text is NFC-composed, so Hangul syllables stay whole. Refold every `_search` column with `searchText(...)` after the upgrade.
- `likeSearch` drops a term with no letter or digit, as FTS does.

**Errors**

- New key: `PAGE_TOO_DEEP`. A `Record<CombErrorKey, string>` of translations needs it.
- `classifySqliteError`, `classifyD1Error` and `classifyPgError` return what each handler would throw, without throwing.
- A foreign-key violation of a row others still reference names the statement's table, the parent, on every engine, wherever the SQL is recorded; a bare node-postgres error names none. SQLite reads a constraint or table name with any character in it.

**Codegen**

- **Relation names come from each key alone.** A many is the plural source when its key is the target's plain `<target>_id`, else `<plural>By<Column>` (`postsByAuthor`, `citiesByCountryCode`, `foldersByParent`); a unique key's way back is a singular `r.one`. A table's only key to a target renames too when it is not the plain `<target>_id`: where `posts` reaches `users` by `author_id` alone, `users.posts` of 0.10 is `users.postsByAuthor`. Regenerate, and update every `with:` that names a renamed relation.
- Constraint values are read on the AST: an inline string means what the same text in a const means (`"/^\d+$/"` is `/^d+$/`), a spread or a computed value fails codegen, and a pattern is `/source/flags` that compiles, with `u` or `v` at most (write a case-insensitive rule into the source, as `[A-Za-z]`).
- DTOs: a `nomutate` column is in the create DTO; a text column named `*Id` takes the id rules only when it is `c.id` or references one; `c.timestamp` takes epochs before 1970; reads take any stored email or URL; a foreign key stays out of the update DTO and in `immutable`, unless it declares `{ mutable: true }`, the opt-in for a reference that moves (a person's team, a category's parent); a column named `createdAt` is autogenerated only when something fills it.
- Constraint maps: a `CHECK` named after its table carries the table once in its key, every `CHECK` but comb's `_enum` and `_size` conventions is "Check constraint violated" with a 400, enum columns' `CHECK`s are mapped, and Postgres keys are cut to 63 bytes. Update translations of a changed key.
- Codegen refuses an unexported table, two constraints sharing an error key, a config `dialect` its tables contradict, and two databases writing one path. A run of the whole config deletes the files of a database the config no longer declares; another tool's generated file is refused; your own `./dtos/*` exports stay.
- A Postgres database's diagram DDL is Postgres DDL.
