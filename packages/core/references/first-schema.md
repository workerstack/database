---
description: First schema
order: 30
---

# First schema

Define a table with the package's column factories instead of Drizzle's raw ones.

```ts
/* src/db/core.tables.ts */
import { sqliteTable, index } from "drizzle-orm/sqlite-core"
import { c } from "@workerstack/database/sqlite/columns"
import * as z from "zod"

/* a c.json schema is exported, so the generated DTOs can import it, and is the stored document:
   no transform, pipe or preprocess, and no null on a NOT NULL column */
export const authorSettings = z.object({ digest: z.boolean() })

export const author = sqliteTable(
	"author",
	{
		id: c.id("aut"),
		email: c.text("email", { max: 254, email: true, lowercase: true, trim: true }),
		display_name: c.text("display_name", { min: 2, max: 64, trim: true }),
		locale: c.text("locale", { format: "bcp47" }),
		settings: c.json("settings", authorSettings),
		created_at: c.createdAt("created_at"),
		updated_at: c.updatedAt("updated_at"),
		deleted_at: c.deletedAt("deleted_at"),
	},
	(t) => [index("idx_author_email").on(t.email)],
)

export const post = sqliteTable("post", {
	id: c.id("pst"),
	author_id: c.ref("author_id").references(() => author.id),
	status: c.enum("status", ["draft", "scheduled", "published"]).notNull().default("draft"),
	title: c.text("title", { max: 200, trim: true }),
	minute_read: c.integer("minute_read", { min: 1, max: 120 }),
	created_at: c.createdAt("created_at"),
	updated_at: c.updatedAt("updated_at"),
})
```

The second argument to each factory is a **constraint object**. At runtime most of it is inert — `c.text("title", { max: 200 })` just becomes `text("title", { length: 200 })` — and the helper records it on the column for codegen, which turns `{ min: 2, max: 64, trim: true }` into a Zod schema, a CHECK constraint, and an OpenAPI description. Constraints live next to the column, once. Codegen loads the tables module, so a constraint value is whatever the module computes: a constant (`pattern: SKU_PATTERN`, `max: NAME_MAX`), an enum member, an object spread over another, a constraint object passed by name, or an enum list built by a call. Each value must be a boolean, a number or a string; `pattern` is a `/source/flags` string, and `schema`, the one value of another kind, an exported zod schema ([Column schemas](#column-schemas)).

Point a config at the file:

```ts
/* database.config.ts */
import { defineCodegenConfig } from "@workerstack/database/codegen"

export default defineCodegenConfig({
	databases: {
		core: {
			dialect: "sqlite",
			driver: "d1",
			tables: "./src/db/core.tables.ts",
			output: { default: "./src/db/_gen" },
		},
	},
})
```

Generate:

```bash
bunx database codegen core
```
