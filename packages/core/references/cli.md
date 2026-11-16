---
description: CLI
order: 40
---

# CLI

```text
database — database codegen + migration toolkit

COMMANDS:
  codegen [db...]           Run codegen for the databases in database.config.ts (all, or those named)
  codegen --tables <path>   Direct mode: analyze one tables file and generate beside it
  migrate init              Create drizzle.config.ts and atlas-migrations/
  migrate diff <db> [name]  Diff the schema and write the next migration
  migrate check <db>        Check and approve the pending migrations, applying nothing
  migrate apply <db>        Apply pending migrations: approve drops, apply and record each at once
  migrate baseline <db>     Record the migrations a database already reflects as applied
  migrate status <db>       Show a database's applied and pending migrations

OPTIONS:
  -g, --generator <name>  Run one generator only [codegen]
  --tables <path>         Analyze this tables file directly, no database.config.ts [codegen]
  -e, --env <name>        Environment from database.migrate.config.ts [migrate apply, migrate baseline, migrate check, migrate diff, migrate status]
  --dir <path>            Migrations directory (default: the config's, else ./atlas-migrations) [migrate apply, migrate baseline, migrate check, migrate status]
  --dialect <name>        The project's dialect: sqlite (default) or postgres [migrate init]
  --dry-run               Write nothing: exit 1 printing the migration a diff would write, 0 in sync, 2 when the check could not run [migrate diff]
  --file <path>           Apply this one migration file [migrate apply]
  -y, --yes               Approve cautious changes without asking (not unsafe ones) [migrate apply, migrate check]
  --local                 Without a migrate config: the local D1 (wrangler --local) [migrate apply, migrate baseline, migrate check, migrate status]
  --hashes                On D1: record the current hash of each applied file that has none (check the files against git first) [migrate baseline]
  --json                  Print one JSON object (database, applied, pending, refused, unknown; stoppedBy when a signal stopped the run) as the only stdout [migrate apply, migrate check, migrate status]
  -h, --help              Show this help
  --version               Print database's version
```

The binary requires Bun — the shebang is `#!/usr/bin/env bun`, and `database migrate diff` runs the project's `drizzle-kit` bin on the runtime running database, Bun here.

The CLI is tested on Linux and macOS (CI runs its loader, codegen and SQLite-family migrate suites on both, with real Atlas) and relies on POSIX process groups, so Windows is not supported: `database codegen` loads each tables module in a child of its own process group, which a supervisor kills whole, with every process the module started, after 60 s, when the run is interrupted, or when codegen itself ends, a `SIGKILL` included. The library itself (columns, queries, error handling) runs wherever its database driver does.

External tools the migration commands shell out to, none of them install-time dependencies: [Atlas](https://atlasgo.io) `>=1.2.0 <2` on `PATH`, and the project's own `drizzle-kit` and `wrangler`, `wrangler` authenticated against the account for a remote D1 database. Each command needs these, on the providers named; the npm clients a provider's commands load are in the peer dependencies table.

| Command                          | Needs                                                               |
| -------------------------------- | ------------------------------------------------------------------- |
| `migrate diff`                   | `atlas` and `drizzle-kit`                                           |
| `migrate check`, `migrate apply` | `atlas`; `wrangler` on D1                                           |
| `migrate baseline`               | `atlas` on bun:sqlite, libsql, Postgres and Turso; `wrangler` on D1 |
| `migrate status`                 | `atlas` on Postgres; `wrangler` on D1                               |

The D1 provider drives `wrangler d1 execute` and `wrangler d1 migrations apply` as child processes, against the remote database by default; set `local: true` in its provider config, or pass `--local` without a migrate config, to target the local dev database. A local database another process holds, `wrangler dev`, another wrangler command or a second `database migrate`, is waited for, up to 5 s, then refused naming the lock: every request locks the local file, even a read, so database runs one the lock failed again, while wrangler's own `migrations apply`, and every remote command, runs once. database tells a lock from wrangler's other failures by workerd's `SQLITE_BUSY` in wrangler's output or, when the run ended before workerd printed it, by trying the file's write lock itself, which opens the file without creating or changing it; a lock let go in the moment between the two reads as wrangler's own internal error, and a rerun succeeds. `wranglerConfig` (relative to `database.migrate.config.ts`; default: the wrangler config beside it) and `wranglerEnv` name the wrangler config that binds the database and its environment, and database passes them as `--config` and `--env` to every wrangler command. Wrangler is given the provider's `databaseName`, a binding or a `database_name` of that config, whatever the environment is called; a binding is the safer choice, since a bare name can reach an unrelated D1 that shares it.

## `database codegen`

```bash
# every database in database.config.ts
bunx database codegen

# one database
bunx database codegen core

# one generator
bunx database codegen core -g dtos

# no config file — analyze a tables file directly
bunx database codegen --tables ./src/db/core.tables.ts
```

Config mode reads `database.config.ts` (or `.js`) from the working directory. Direct mode skips the config and writes next to the tables file, which is useful in a scratch repo or a test.

## `database migrate`

| Dialect                          | `diff` writes the next migration with                                                           | `apply` and `baseline` run through                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| SQLite, libsql, Turso            | Atlas on an in-memory SQLite, plus database's FTS5 part                                         | database: each file and its hash in one batch, recorded in `__drizzle_migrations`                         |
| D1                               | Atlas on an in-memory SQLite, plus database's FTS5 part                                         | database checks, then `wrangler d1 migrations apply` applies and records in the binding's `d1_migrations` |
| Postgres (plain, Neon, Supabase) | Atlas on the dev database, plus database's part for what Atlas OSS refuses (views, policies, …) | Atlas, after database snapshots, classifies and approves each file; recorded in `atlas_schema_revisions`  |

On SQLite, libsql and Turso, apply with `database migrate apply`, not drizzle-kit migrate: database's `__drizzle_migrations` is its own history, not drizzle-kit's, and drizzle-kit 1.0's migrate fails on it with "no column named applied_at".

`init` scaffolds `drizzle.config.ts` and `atlas-migrations/`, and no `atlas.hcl`: database runs Atlas with a config of its own, and database's unsafe gate, not an Atlas `skip` block, is what stops a drop. Delete an `atlas.hcl` an earlier `init` wrote; `init --dialect postgres` adds a `database.migrate.config.ts` whose URL comes from `DATABASE_URL`, and no file holds a credential. `check` runs the check every apply runs first and applies nothing; it reads the database's history, so it needs the database. `baseline` adopts a database that already has the schema: it records the migrations as applied without running any, but only once the database's schema is the one they leave (on D1, only the files database 0.7's `__drizzle_migrations` records). `status` lists a database's applied and pending migrations. `diff --dry-run` writes nothing: it exits 0 when the schema is in sync, 1 printing the migration a diff would write, and 2 when the check could not run (Atlas or drizzle-kit missing or failing, an unreachable `devUrl`, a config or an argument database refuses), so a gate can act on drift alone.
