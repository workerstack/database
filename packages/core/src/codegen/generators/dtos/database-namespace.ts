/**
 * How generated DTO files reach database's own predicates: under one namespace, `database`, so
 * a c.json schema exported under a predicate's name cannot capture it. A global the generated code
 * calls is named through globalThis for the same reason; `database` and `globalThis` are the names a
 * schema import is aliased away from (schema-aliases.ts).
 */

/** Whether generated code names database's namespace */
export const DATABASE_NAMESPACE: RegExp = /\bdatabase\./

/** The import a generated file that names database's namespace takes */
/* written whole from a quoted specifier, so no scan of database's own imports reads it as one */
export const databaseImport = (databaseFrom: string): string =>
	`import * as database from ${JSON.stringify(databaseFrom)}`
