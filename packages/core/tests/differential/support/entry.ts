/**
 * Everything a differential case builds a list with, from one comb and the drizzle it resolves. Imported in
 * place it is the tip: `@workerstack/database` resolves to this package's own src. A copy in an oracle's box
 * (oracles.ts) resolves the published tarball and the drizzle installed beside it, so each version builds its
 * tables, its database handles and its lists with its own drizzle, as an app on that version does.
 */
export { createClient } from "@libsql/client"
export { createListQuerySchema, queryHelpers } from "@workerstack/database/query"
export { applyListQuery, buildDerivedListQuery, buildListQuery } from "@workerstack/database/query/sqlite"
export { paginateMerged } from "@workerstack/database/sqlite/d1/sharding"
export { defineRelations, eq, getTableColumns, sql } from "drizzle-orm"
export { drizzle as d1Drizzle } from "drizzle-orm/d1"
export { drizzle as libsqlDrizzle } from "drizzle-orm/libsql"
export { blob, customType, integer, numeric, real, sqliteTable, text } from "drizzle-orm/sqlite-core"
