---
description: Upgrading to 0.7.0
order: 370
---

# Upgrading to 0.7.0

0.7.0 migrates Postgres: `comb migrate init --dialect postgres`, `diff`, `apply`, `baseline` and the new `status` work on a `postgres` provider through Atlas ([Postgres](#postgres)). SQLite, libsql, Turso and D1 work as before. What changes for code that uses the API:

- `ProviderConfig` is `ConnectionProviderConfig | PostgresProviderConfig`, and `createProvider()` takes a `ConnectionProviderConfig`: narrow on `type !== "postgres"` before you call it. `ResolvedDatabaseConfig.provider` carries the Postgres provider with its defaults filled in (`ResolvedPostgresProviderConfig`, `DEFAULT_PG_DEV_URL`).
- `generateSchemaDiff()` and `generateIncrementalMigration()` take a `target` (`devUrl`, `schema`, `lockTimeout`) on Postgres and refuse to run without one; the hard-coded `postgres://localhost:5432/dev` is gone.
- `exportDrizzleSchema()` takes `configPath` and, on Postgres, `schema`: it drops that schema's `CREATE SCHEMA` and refuses an object in another one.
- `migrate diff` reads `comb.migrate.config.ts` for the database's directory and drizzle config; it wrote to `./atlas-migrations` whatever the config said.

A database you migrated with `drizzle-kit migrate` under 0.6.0 moves over in three steps: point `migrationsDir` at a new, empty directory; run `comb migrate diff <db> baseline`, which writes the whole current schema as one migration; then `comb migrate baseline <db>` records it as applied without running it. From there, `diff` and `apply` take over; drizzle-kit's own history table is no longer read.
