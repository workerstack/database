---
description: Upgrading to 0.26
order: 140
---

# Upgrading to 0.26

What changes for a project on 0.25. Each item below is a valid input database refused, or answered with the wrong error, now served, or refused where it fails rather than later. Run the tests of your API against 0.26 before deploying.

1. **Know what changed in the API.** A test holds these three lists to the exports themselves.

   New exports: `TursoCreate`, `TursoFetch`, `TursoRead`, `TursoResponse`.

   Removed: none. **Fix:** none.

   Changed: `ListQueryRequest`, `ListQuerySchema`, `ListQueryShape`, `TursoCredentialsRequest`, `TursoDeps`, `createListQuerySchema`, `createTursoProvider`, `getTursoCredentials`, `orderParamMeta`.

   `TursoDeps.fetch`, and so `TursoCredentialsRequest`, `getTursoCredentials` and `createTursoProvider`, now take a `TursoFetch`, the fetch as the Turso calls make it (a `TursoRead` GET or the `TursoCreate` POST, answered with a `TursoResponse`), in place of `typeof fetch`: a project with neither the DOM's types nor a runtime's, such as `lib: ["ES2023"]` with `types: []`, failed on `./migrate`'s declarations with TS2304 `Cannot find name 'fetch'`. The global fetch, and any fetch typed `typeof fetch`, is a `TursoFetch`. **Fix:** none.

   A list schema's `order` param is now optional in its shape, as `filter` and `q` are: a list with `sort: []` publishes no `order`, where 0.25 published one whose every example the endpoint refused. `ListQueryRequest`, `ListQuerySchema` and `ListQueryShape` type `order` as possibly absent, and `createListQuerySchema` returns them. `orderParamMeta` takes a non-empty `sort`, and `createListQuerySchema` throws on a field name its params cannot spell (step 2). **Fix:** code that reads `order` off a schema made with `sort: []` stops reading it; code that passes `orderParamMeta` a `string[]` passes `[first, ...rest]`.

2. **A list's names are ones its params can spell.** A sort, filter or tiebreak field named with a comma, a space or `asc`/`desc`, such as `a,b` or `asc`, published examples its own endpoint refused as malformed or unknown. `createListQuerySchema` now throws on such a name, naming it. **Fix:** rename the field, or leave it out of `sort`, `filter` and `tiebreak`.

3. **Every published example passes its endpoint.** The `filter`, `q` and `page` examples were fixed text, so under a tight `maxConditions`, `maxDepth`, `maxSearchTerms` or `maxPage` a client replaying them got a 400. Each example is now kept only where the endpoint's limits pass it, and `createListQuerySchema` throws on a `maxConditions` or `maxSearchTerms` of 0 beside a declared `filter` or `search`. **Fix:** a contract test that pinned the examples reads the new ones; for a limit of 0, drop that param from the config instead.

4. **A hand-made `pageBound` or `limitBound` is held to the schema's rule.** A parsed request made without the schema, with an infinite or fractional bound, reached the driver as a bad offset or served a limit past it. Both bounds must now be safe integers from 1, with `(pageBound - 1) * limitBound` within 2^53 - 1, and one that is not is a 500 `page_not_wired`. **Fix:** parse the request with the list schema, or state bounds that meet the rule.

5. **The manifest's patterns are the DTO's, and compile everywhere.** A plain SQLite `numeric` stated no pattern in the manifest, so a reader validating writes from it, as meta contract §8.2 describes, took values the create DTO refused with a 400. It now states the DTO's pattern. The id pattern was published with a `\u` escape that RE2, and so Go, refuses; it is now published as the characters themselves, and every manifest pattern compiles under RE2. **Fix:** regenerate, and drop any pattern a reader added for the `numeric` itself.

6. **A `bun-sqlite` provider under Node says to run it under Bun.** `migrate` under Node failed with Node's loader error about the `bun:` scheme. It now refuses naming Bun, the loader's error as its cause. **Fix:** run `migrate` for that provider with `bun`.

7. **A CHECK a trigger fails in another table answers that table's key.** On SQLite, libsql, bun:sqlite and D1 the handler looked for a CHECK's name in the statement's table alone, so a trigger's write that failed another table's CHECK answered the generic cause against the statement's table. It now looks there first, then in the one other table whose map names the constraint, and answers that table's error; where two or more tables name it, it answers the generic error with no table. **Fix:** none, unless a client matched the generic cause for such a write.

8. **A REPLACE of a referenced row answers the generic foreign-key 409.** On SQLite, libsql, bun:sqlite and D1, a `REPLACE INTO` or `INSERT OR REPLACE` into a referenced table that failed a foreign key answered the referencing column's not-found error, telling the client a valid row did not exist. It now answers the generic 409, as any foreign-key failure the handler cannot pin on one key does, since a REPLACE deletes the rows its values conflict with. A foreign-key failure a trigger makes in another table is still blamed on the statement table's listed key when the statement sets that column, as SQLite's message cannot tell the two apart. **Fix:** a client that matched the not-found key for a REPLACE matches the generic one.

9. **Check replays a committing `DO` or `CALL` with apply's ids.** A `-- atlas:txmode none` file whose `DO` block or `CALL` commits ran first in a trial that check rolls back, which left each sequence it advanced advanced, so the later rows of the replay took other ids and check refused a foreign key that apply then met. Check now sets each such sequence back after the trial. **Fix:** none.

10. **A migration header reads directives as Atlas does.** A header with CR-only line ends, or a last line with no `\n`, read a directive Atlas does not, so a `-- atlas:txmode none` file checked clean and failed apply inside a transaction. database now reads directives only from lines Atlas reads as ended, a CR kept as part of the line. **Fix:** end header lines with `\n`.

11. **Check refuses a file that ends its transaction read-only.** A transactional file ending in `SET TRANSACTION READ ONLY` or its `SET LOCAL` or `set_config` form checked clean, and apply then failed writing its revision in that transaction. Check now refuses it with the error apply fails at. **Fix:** move the statement out of the file, or into a `-- atlas:txmode none` file.

12. **An index name Postgres numbers past another object's is predicted.** Postgres numbers an index's name past a sequence's, a composite type's or a materialized view's, and a constraint's index past a CHECK's, a domain constraint's or a constraint trigger's of that name; database counted tables, views, indexes and foreign keys alone, so it rated a `REINDEX` of the wrong index. It now follows each such name through rename, move and drop. **Fix:** none.

13. **Partitions' clones are named in their bounds' order.** Where clones' names cut to one at 63 bytes, Postgres numbers them in the partitions' bound order, which database read as the history's. It now sorts by RANGE, LIST and HASH bounds and puts DEFAULT last; where bounds it cannot compare make cut names mix partitioned and plain partitions, a transactional `REINDEX INDEX` of such a name is refused. **Fix:** put such a statement in its own `-- atlas:txmode none` file, or set `devUrl`.

14. **Check refuses an `EXECUTE` whose statement is gone.** In a `-- atlas:txmode none` file an `EXECUTE` after a `DEALLOCATE` of its name, `DEALLOCATE ALL`, `DISCARD ALL` or `DISCARD PLANS` passed check, and failed apply partway. Check now refuses it, naming the statement that removed it. `DISCARD TEMP` keeps the names. **Fix:** `PREPARE` the statement again after the removal.

15. **`migrate status` lists a history it cannot resume.** A pending `-- atlas:txmode none` file whose version sorts below an applied one made `status` throw with no list. `status` now lists the pending files and names the file and why, exit 0; `check` and `apply` still refuse it. **Fix:** none.

16. **A merged SQLite list serves a page beside a held-apart key.** A merged list threw 500 `sort_not_wired` when any shard over-read a row whose key held a storage class its mode reads as another, such as a TEXT in a `timestamp`, even one the page did not serve. It now carries each such key's stored value (`_cursorTextKeys`), merges by it, and answers the 500 only on the page that serves such a row, as a single database's list does. **Fix:** none.

17. **A misspelt limit is refused, and each limit is held to its own floor.** `limits` dropped a key that is no limit, such as `maxCondition`, and kept the default, so the cap the app meant to set was never set. `createListQuerySchema` and `validateFilter` now throw a `TypeError` naming the key and the limits they take. A list's `maxSortKeys` was checked from 0 and then from 1, so `-1` was refused as "from 0", a floor `0` did not meet either; each limit is now checked once, against its own floor, and a value that is no number prints as written (`"5"`, not `5`). **Fix:** correct a misspelt key; the message is the only other change.

18. **A ULID factory that has issued its last says so.** At the clock's last millisecond with its random part used up, the next call threw a `RangeError` saying the clock read past 2^48 - 1, which it had not. It now says no ULID is left after the last millisecond. **Fix:** none.

19. **A CTE named `replace` and a `U&"…"` table are read as their statement.** The error handler took the first verb word of a statement, so a `WITH replace(id) AS (…) DELETE …` read as a REPLACE and answered its foreign-key failure against no table, and a Postgres `U&"\0070ost"` table was named `u&`. It now skips each CTE by its shape to the statement's own verb, and decodes a `U&` name, `UESCAPE` included. **Fix:** none.

20. **The apply question ends its line at end of input.** With no answer, Ctrl-D or a closed stdin, the refusal that followed was printed on the question's line. It now starts on its own. **Fix:** none.

21. **`apply` counts the files this run applied.** On a SQLite database other than D1, when another run applied one of the pending files first, `apply` counted it applied on its `Done:` line and listed it in the JSON's `applied`. Both now count this run's files alone, and the `Done:` line counts the other run's as skipped. **Fix:** a deploy script that read `applied` as every pending file reads the files left pending from `migrate status`.

22. **`migrate status` names the last applied file by name order, on Postgres.** Atlas lists applied revisions in the order it ran them, so after `1.6_a.sql` and then `15_b.sql`, `Applied: 2 (up to 1.6)` named the wrong file, as did `baseline`'s refusal of a database that records files. It now names the file that sorts last by name, as database orders files. **Fix:** none.

23. **Check's refusal of a transactional file's own `BEGIN` says what it does, on Postgres.** Atlas runs a file without `-- atlas:txmode none` in one transaction, so check refuses the file's own transaction control, and said its `BEGIN` or `START TRANSACTION` ends that transaction. Postgres starts none there, as one is already open, and only warns; the refusal now says so. **Fix:** none.

24. **Check refuses a migration file saved with a UTF-8 byte order mark.** Atlas sends the mark as the first character of the first statement, where Postgres and SQLite read it as a syntax error, so such a file failed in `devUrl` or apply with an error that named the SQL. Check now refuses it, naming the file. **Fix:** save the file as UTF-8 without a BOM.

25. **Cursor and session statements are recognized on Postgres.** `DECLARE … CURSOR`, `FETCH`, `MOVE`, `CLOSE`, `DEALLOCATE` and `DISCARD` were rated unsafe as statements database did not recognize. Each is now rated as the session statement it is. **Fix:** drop the approval a file carried for them.

26. **Check refuses a `SET TRANSACTION`, `SET LOCAL` or `SET CONSTRAINTS` outside a transaction block, on Postgres.** In a `-- atlas:txmode none` file Postgres only warns at each, and the setting does nothing, so a file that meant to set an isolation level or defer constraints applied without it. Check now refuses each there. **Fix:** put the statement inside a `BEGIN … COMMIT` in that file, or move it to a transactional file.

27. **A `VALIDATE` in code database cannot read warns of its lock, on Postgres.** A `DO` block, a `CALL`, an `EXECUTE` or a call of a function database does not know can run `ALTER TABLE … VALIDATE CONSTRAINT`, which scans the table under a lock. Check's replay read the locks held at a top-level `VALIDATE` alone, so such a block rated with no `LOCK` entry. The replay now reads the unvalidated constraints around each such statement and names each table a constraint of which it validated, with the locks held as it ended. **Fix:** none; move the `VALIDATE` out of the block, or accept the warning.

28. **A partitioned table's move warns of no rewrite, on Postgres.** `SET TABLESPACE` and `SET ACCESS METHOD` on a partitioned table, which holds no data, and `ALL IN TABLESPACE x SET TABLESPACE x`, which moves nothing, warned that they rewrite or scan the table. None of them does, and none warns now. **Fix:** none.

29. **A retype warns of an index rebuild only where an index reads the column, on Postgres.** Any retype that rebuilds indexes, such as a new `COLLATE`, warned that it rebuilds every index on the column, even with no index there. It now warns only where an index reads the column, through its key, `INCLUDE`, an expression or a predicate, on the table, its partitions or its inheritance children. **Fix:** none.

30. **A foreign key's name is numbered past a constraint of that name, on Postgres.** Postgres numbers a foreign key's name past a `UNIQUE`, `CHECK` or other constraint its table already has under that name, and database numbered it past foreign keys alone, so it predicted a name Postgres did not give and rated a later statement on the wrong constraint. It now numbers it as Postgres does. **Fix:** none.

31. **A partition's index attaches to its parent's as Postgres matches them, on Postgres.** Postgres attaches a partition's index to its parent's when their operator classes and collations resolve to the same ones, so `a int4_ops` matches `a` on an `int` column, and database compared their spelling, predicting a clone Postgres did not make. It now resolves each element's default class and collation as Postgres 17 does. Where it cannot resolve them, such as an expression's collation or an extension type's class, it cannot tell whether Postgres made the clone, and refuses a `REINDEX INDEX` that names it. **Fix:** spell the classes and collations alike on both sides, or set `devUrl` so check replays the history.

32. **An expression index is named as Postgres names it, on Postgres.** database named every expression column `expr`, so it predicted `t_expr_idx` for an index Postgres named `t_lower_idx`, and rated a `REINDEX` or `DROP INDEX` of the wrong index. It now names each as Postgres 17 does: after its function, field, cast type or construct, else `expr`. **Fix:** none.

33. **A `DROP COLUMN` reaches an inheritance child as Postgres drops it, on Postgres.** A column dropped from a parent was kept on each child, with the child's indexes and keys on it, so database rated later statements against an index Postgres had dropped. It now drops the column from each child that holds it from the dropping parents alone: not one that declared it itself, holds it from another parent, or kept it through `ONLY` or `NO INHERIT`. A column rename reaches every table under the parent. **Fix:** none.
