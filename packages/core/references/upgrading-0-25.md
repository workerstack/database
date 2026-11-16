---
description: Upgrading to 0.25
order: 150
---

# Upgrading to 0.25

What changes for a project on 0.24. Each item below is a value database stored, returned or rated wrong, or a valid input it crashed on, now refused, corrected or served. Run the tests of your API against 0.25 before deploying.

1. **Know what changed in the API.** A test holds these three lists to the exports themselves.

   New exports: none.

   Removed: none. **Fix:** none.

   Changed: `DatabaseError`, `IsoInstant`, `classifyD1Error`, `classifyPgError`, `classifySqliteError`, `constraintError`.

   `DatabaseError.toJSON()` now carries `cause`, the message safe to show a client, which 0.24 left out of the body, so a client got the error key alone; `classifyD1Error`, `classifyPgError`, `classifySqliteError` and `constraintError` change only in returning it. A body without a cause still leaves the key out. **Fix:** a client that read the cause from elsewhere reads it from the body; one that asserts the body's exact keys expects `cause` when the error has one.

   `IsoInstant` gains `cut` and `fraction`, and its constructor takes the nine-digit `fraction` as an optional second argument (step 8). **Fix:** none; an `IsoInstant` built from epoch milliseconds alone reads as before.

2. **A plain Postgres time, timestamp or interval takes at most 6 digits after the second's point.** A column declared with no precision holds 6, Postgres's default, and rounds a 7th: `2026-12-31T23:59:59.9999995` into a plain `timestamp` was taken and stored as `2027-01-01 00:00:00`. The write DTO of a `timestamp`, `timestamptz`, `time`, `timetz` or `interval` with no precision now refuses a 7th digit with a 400, as one declared `(6)` did. **Fix:** send at most 6 digits, or round on the client.

3. **A SQLite `numeric` takes a fraction of at most 13 digits.** drizzle reads a SQLite `numeric` back as text, and SQLite 3.53, which bun ships, writes a REAL of 14 or 15 digits back as another decimal: `57.2505567882849` read back as `57.250556788284897`. A whole number keeps its 15 digits, and the write DTO now refuses a fraction past 13 digits with a 400. D1 and libsql printed 15 then, and will print 17 once their SQLite reaches 3.53. **Fix:** send at most 13 digits of a fraction, or store a longer one as text or in whole units, such as cents.

4. **A state column with an `initial` state is NOT NULL or has a default.** A create that left a nullable state column out stored null, a row in no state of its machine, which no transition leaves. Codegen now refuses the column, naming it and the `initial` state. **Fix:** add `.default("<initial>")`, or `.notNull()` so a create sends the state.

5. **A tenant column is NOT NULL and not private.** A create could leave a nullable tenant column out or send null, a row in no tenant, which every tenant's list skipped; and a private tenant column was published nowhere, so the stamp named no boundary. Codegen now refuses each, naming the column. **Fix:** add `.notNull()` to the tenant column, and drop `private` from it.

6. **A list breaks ties on its schema's `tiebreak`.** A list schema publishes its `tiebreak` as `stableTiebreak`, but `buildListQuery` and `listOptions` broke ties on `id` whatever it named, so a client walking the list by the published column saw rows out of its order. Each now orders and pages by the schema's column, and refuses a table without it, naming the column. **Fix:** none, unless a table lacks its schema's tiebreak column: add the column, or name one the table has.

7. **A filter on a Postgres table runs as Postgres SQL.** `filterToSQL`, `conditionToSQL` and `patternToSQL` read the dialect from the table or column, and lowered a Postgres filter as SQLite SQL: `like` or `ilike` with an inner `*`, `contains`, any date filter, a fraction on an integer column and an empty `or()` each failed in the driver, and `ilike.a*t` ran case-sensitive, returning fewer rows. Each now runs as Postgres SQL, `contains` on a `json` or `jsonb` column. A number filter whose decimal a double does not hold as written, such as `1.000000000000000001`, is now refused with a 400, as an integer past 2^53 is. **Fix:** send a number a double holds; on Postgres, keep `contains` to `json` and `jsonb` columns.

8. **An ISO date filter compares a fraction past milliseconds exactly.** It was cut to milliseconds, so `lt 00:00:00.9995Z` missed the row at `.999`, and `gte`, `eq` and `ne` were each wrong the other way. Every operator now answers the exact comparison, on a Postgres timestamp to the microsecond. `IsoInstant` carries `cut` and the nine-digit `fraction`. **Fix:** none.

9. **`migrate init` reads the drizzle config `diff` reads.** It checked `drizzle.config.ts` alone, so beside a Postgres `drizzle.config.js` it wrote a SQLite `drizzle.config.ts`, which `diff` then read first. `init` now reads the first of `drizzle.config.ts`, `.js`, `.mjs` and `.json`, as `diff` does, refuses one that states the other dialect, naming it and writing nothing, and writes no `drizzle.config.ts` beside one. **Fix:** delete a `drizzle.config.ts` an earlier `init` wrote beside your own drizzle config.

10. **`--json` on a D1 database prints its JSON alone.** database read the wrangler config with wrangler's reader in its own process, and what that reader printed, a warning on a key it does not know and the newer-version notice, landed on stdout ahead of the JSON. It now reads the config in a child on node, so stdout holds the one object. **Fix:** drop any line-skipping a deploy script added before parsing the output.

11. **Expect a lock warning for a move or an `ATTACH PARTITION` after code the history cannot read, on Postgres.** A `DO` block, a `CALL` or a call of a function the history defined can run `ALTER TABLE … SET LOGGED` or drop a `CHECK` through `EXECUTE`, which the history's text does not show. 0.24 kept what the text said, so a `SET UNLOGGED` of a table such a block had made logged, and an `ATTACH PARTITION` whose proving `CHECK` it had dropped, each checked clean while Postgres rewrote or scanned the table under an exclusive lock. After such a statement, database no longer knows where each relation is or what a `CHECK` proves: a `SET LOGGED` or `SET UNLOGGED`, like a `SET TABLESPACE` or `SET ACCESS METHOD`, now reads the target's catalog when the `postgres` package is installed, and warns without it, and an `ATTACH PARTITION` warns of the scan until a later file validates a `CHECK` again. **Fix:** none, or validate the bound's `CHECK` in a file after the block, as the warning's recipe says.

12. **A `c.json` schema holds only what JSON stores as itself.** The schema is the stored document, so a part JSON stores as another value failed every read of the row: a `Date` stored as a string, a `Map` or `Set` as `{}`, `NaN` as `null`, `undefined` in an array as `null`, and a field typed `z.undefined()` left out; and JSON stores no `BigInt`, `Symbol`, `File`, function or `Promise` at all. Codegen now refuses such a schema, naming the column and what JSON does with the part. **Fix:** store an ISO string (`z.iso.datetime()`) for a date, a string of digits for a BigInt, a URL or key for a file, a `z.record()` for a map and a `z.array()` for a set; make an array element `.nullable()` and a field `.optional()`.

13. **A migrate config imports database's type alone.** A compiled app, or any project where `@workerstack/database` does not resolve beside the config, failed to load a config that imported `defineConfig`. `migrate init` now writes `import type { MigrateConfig } from "@workerstack/database/migrate"` and ends the object with `satisfies MigrateConfig`, and a config that fails to load for want of the package says to. **Fix:** in such a project, move the config to that form; `defineConfig` still works wherever the package resolves.

14. **A derived list builds on a key column whose SQL name differs from its property.** `buildDerivedListQuery` compared `idColumn`'s SQL name with the schema's tiebreak, a property key, so `id: text("post_id")` under the default tiebreak threw a `TypeError`. It now compares the property key, and the error names the key. **Fix:** none.

15. **A cursor carries a bigint of any length.** A list sorted by a bigint past 20 digits, such as a Postgres `numeric(78, 0)` in drizzle's bigint mode, answered a 500 `sort_not_wired` on its first page. The cursor now carries any integer, bounded by the cursor's own length. **Fix:** none.

16. **Check refuses a file that makes a view, a trigger or a DEFAULT that cannot run.** SQLite resolves their names only when a statement runs, so a new view of a column no table has, a trigger body calling a misspelt function, or a `DEFAULT` calling one SQLite lacks (`if()` on libsql) passed check, applied, and failed every read or write through it. Check now compiles each view and trigger a file makes or changes, and an insert of defaults into each table it makes or changes, and refuses the file naming the object and SQLite's error. **Fix:** correct the object in its file; a history that already holds one blocks no later file.

17. **A bit string of the wrong length or malformed xml is a 400 on Postgres.** SQLSTATE 22026, 2200N and 2200M reached the app as unmapped errors, a 500. Each is now `invalid_value`, as every other bad value is. **Fix:** an error handler that matched those codes itself reads `invalid_value`.
