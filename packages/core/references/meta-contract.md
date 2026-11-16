---
description: Meta contract
order: 110
---

# Meta contract

database stamps facts about your tables and queries onto the schemas it generates, so a document
generator downstream can publish them without re-deriving anything.

<!-- ts-context
declare const postDtoReadSchema: import("zod").ZodType
-->

```ts
import { readEntityMeta } from "@workerstack/database/meta"
import * as z from "zod"

readEntityMeta(z.toJSONSchema(postDtoReadSchema))
// { v: 1, kind: "entity", name: "post", identity: "id",
//   generated: [...], immutable: [...], softDelete: "deleted_at",
//   tenantColumn: null, uniqueIndexes: [{ columns: ["title"], name: "idx_post_title" }] }
```

Two producers stamp automatically: the DTO generator puts `EntityMeta` on each read schema,
and `createListQuerySchema` puts `QueryMeta` on what it returns — built from the same config
object that parses the request, so the published facts cannot drift from the parser's behavior.

Everything rides on one reserved JSON Schema key, `x-database`, carrying a version. Readers ignore
unknown fields and refuse a payload newer than they understand rather than guessing at it.

`databaseMeta()` stamps, `readDatabaseMeta()` / `readEntityMeta()` / `readQueryMeta()` read, and
`carryDatabaseMeta()` re-stamps after a `.extend()` (which drops Zod metadata silently). The full
contract — wire format, versioning rules, and what database deliberately does not claim to know — is
in [`packages/core/docs/meta-contract.md`](../docs/meta-contract.md).
