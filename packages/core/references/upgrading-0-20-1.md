---
description: Upgrading to 0.20.1
order: 210
---

# Upgrading to 0.20.1

What changes for a project on 0.20.0. Before deploying it:

1. **Regenerate for a written JSON field's published shape.** A written `c.json`, `json`, `jsonb` or SQLite `text({ mode: "json" })` field publishes its schema itself, its `x-comb-*` keys on it: a registered schema is `{ "$ref": …, "x-comb-*" }`, and a nullable field is `anyOf: [<schema with its keys>, { type: "null" }]`, the keys on the property too. 0.20.0 published a one-member `anyOf` around the schema, which a generator that does not flatten one types as any JSON: Go and Rust clients typed such a field `json.RawMessage` or `serde_json::Value`, and a generated CLI dropped its flag. What a DTO accepts, its TypeScript type and `.unwrap()`'s keys are unchanged. **Fix:** regenerate.
