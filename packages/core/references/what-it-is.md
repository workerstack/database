---
description: What it is
order: 10
---

# What it is

Database framework for Cloudflare D1, PostgreSQL, and SQLite. Dialect-agnostic column builders on top of Drizzle, constraint-aware error mapping, D1 Sessions and sharding, a PostgREST-style list-query layer, schema codegen, and an Atlas-backed migration toolkit.

This repo is the source of the [`@workerstack/database`](https://www.npmjs.com/package/@workerstack/database) npm package. The CLI binary is `database`.

Moved from `@lovrozagar/database`: `@workerstack/database@0.21.0` is the same release as `@lovrozagar/database@0.21.0` under the new name, and the old package is deprecated. To switch, follow step 3 of [Upgrading to 0.22](#upgrading-to-022).

This README is the full usage manual. An agent that reads only this file should be able to define tables, generate artifacts, run migrations, and serve list queries without opening source.

@workerstack/database sits on top of [Drizzle ORM](https://orm.drizzle.team). Drizzle stays the query builder and the runtime; this package adds the parts a multi-dialect, multi-tenant application needs and Drizzle deliberately leaves open:

- **One column vocabulary across dialects.** `c.timestamp()`, `c.json()`, `c.id()` mean the same thing whether the table compiles to SQLite or PostgreSQL, so a table file can move between the two.
- **Constraint violations as domain errors.** A unique-index failure from D1, libsql, or Postgres becomes a single `DatabaseError` with an `errorKey`, an HTTP status, and the offending table and column.
- **Codegen from the table files.** Codegen loads your Drizzle tables module and reads each table as drizzle built it, with the constraints the package's column helpers recorded, and emits DTOs, Zod schemas, relations, FTS5 tables, column name maps, ER diagrams, and a typed ORM client.
- **Migrations with a safety rail.** Atlas produces the diff; database classifies it, makes it idempotent, hashes it, records it, rewrites SQLite's `foreign_keys` pragma dance into a `defer_foreign_keys` prelude, and guards a rebuild of a table other tables reference so its drop deletes none of their rows.
- **A list-query layer.** A PostgREST-style `filter`, `order`, `select` grammar parsed into an AST, validated against declared field types, and lowered to SQLite SQL with cursor pagination and FTS5 search.
- **D1 at scale.** The Sessions API for read-after-write consistency, bookmark tracking, and an org-to-shard router with a three-tier LRU → KV → core-D1 lookup.

Every layer is usable on its own. Nothing here requires an HTTP framework.
