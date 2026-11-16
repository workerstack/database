---
description: Upgrading to 0.6.1
order: 380
---

# Upgrading to 0.6.1

0.6.1 fixes the destructive-change gate of `comb migrate apply`, which let most drops through: a quoted or schema-qualified name (Atlas quotes every name it emits), a drop after another action in one `ALTER TABLE`, and a column Atlas drops on SQLite by rebuilding the table all classified safe. Every statement and every `ALTER TABLE` action is read now ([Diff and apply](#diff-and-apply)), so files that ran without a prompt may now stop:

- **`--yes` approves cautious files only.** An unsafe file needs a yes on a terminal, or a line `-- comb:allow-unsafe: <reason>` in the file. In CI, add the line to each unsafe migration you mean to run; comments do not change a migration's hash, so files already applied stay applied.
- **More is unsafe:** column retypes, renames, `CASCADE`, schema, type, sequence and role drops, and `DELETE` or `UPDATE` without a `WHERE`. `DROP NOT NULL` is safe now, and dropping a default or constraint is cautious.
- `classifyMigration()` and `extractDropStatements()` take `{ dialect, before }`: the dialect the file is read in (unnamed, both readings count and the stricter wins), and the schema the earlier files leave (`extractSchema(sql, from)` continues one). `MigrationClassification` adds `cautiousStatements` and `lockWarnings`. `segments()` and `splitSqlStatements()` take a dialect; a quoted identifier is now an `identifier` segment, and a Postgres `DO` body a `body` one.
