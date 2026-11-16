import { c } from "@workerstack/database/sqlite/columns";
/** The tables every SQLite e2e app is generated from; copied into the app as src/db/core.tables.ts */
import { sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";

export const post = sqliteTable(
  "post",
  {
    created_at: c.createdAt("created_at"),
    deleted_at: c.deletedAt("deleted_at"),
    id: c.id("pst"),
    minute_read: c.integer("minute_read", { min: 0 }).notNull().default(0),
    status: c.enum("status", ["draft", "published"]).notNull().default("draft"),
    title: c.text("title", { max: 200, min: 1 }).notNull(),
    updated_at: c.updatedAt("updated_at"),
  },
  (t) => [uniqueIndex("idx_post_title").on(t.title)],
);
