---
description: Cloudflare D1
order: 100
---

# Cloudflare D1

## Loading a `wrangler d1 export`

An export, from `wrangler d1 export <db> --remote --output dump.sql`, lists its tables by name and each table's rows after its own `CREATE TABLE`. So a child's rows can come before its parent's table, and the file does not load as written into a database with foreign keys on. To load it, into a local copy or a restore, reorder it: `PRAGMA defer_foreign_keys = on` first, then every `CREATE TABLE`, then the rest (rows, indexes, triggers). `splitSqlStatements` from `@workerstack/database/migrate` splits the file quote-aware. An export blocks the database's requests while it runs, so take a production export off-peak, and take a Time Travel bookmark with it.

## Sessions

<!-- ts-context
import { defineRelations } from "drizzle-orm"
declare const env: { DB: D1Database }
declare const bookmarkFromCookie: string | undefined
const relations = defineRelations({})
-->

```ts
import { openD1Session } from "@workerstack/database/sqlite/d1/session"
import { drizzle } from "drizzle-orm/d1"

const { client, session } = openD1Session(env.DB, { bookmark: bookmarkFromCookie })
const db = drizzle(client, { relations })
```

A bookmark guarantees the client never sees state older than its own last write. Without one the session opens on the primary (`first-primary`), so a read sees every write before it; pass `{ constraint: "first-unconstrained" }` for a read that may lag, such as a public page, to read from the nearest replica. An empty bookmark counts as none. If `withSession` is missing — miniflare, older runtimes — it returns the raw handle and `session: undefined`, so the same code path works locally.

## Bookmarks

<!-- ts-context
declare const session: D1DatabaseSession | undefined
declare function setCookie(name: string, value: string): void
-->

```ts
import { BookmarkTracker } from "@workerstack/database/sqlite/d1/bookmark"

const tracker = new BookmarkTracker()
tracker.track(session, "core")
/* after the response body is settled */
for (const { tag, bookmark } of tracker.getBookmarks()) setCookie(tag, bookmark)
```

`track` takes `openD1Session`'s `session` as it comes: on a runtime without sessions it is `undefined`, and `track` does nothing. `getBookmarks()` skips sessions that never committed rather than throwing, so it is safe to call unconditionally at the end of a request.

## Sharding

<!-- ts-context
type Env = { CORE_DB: D1Database; SHARDS: KVNamespace }
declare const orgId: string
-->

```ts
import { ShardRouter, shardMap } from "@workerstack/database/sqlite/d1/sharding"

/* module scope — the LRU must outlive the request */
const router = new ShardRouter({ totalShards: 16, maxOrgsPerShard: 500 })

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const mapping = await router.resolveOrAllocate(orgId, { coreDb: env.CORE_DB, kv: env.SHARDS }, ctx)
		// …
	},
}
```

Resolution is three tiers: a per-isolate LRU with stale-while-revalidate, then KV, then the core D1 `shard_map` table (exported as a ready-to-use Drizzle table). The core read goes to the nearest replica, and to the primary when the replica has no mapping, since a fresh placement may not have reached it yet. A miss on the primary is remembered in the isolate for `missTtlMs` (5 s, at most `lruMaxSize` orgs), so a run of requests for an unknown id reads the primary once; `place`, `move` and `invalidate` forget it. Revalidation of a stale LRU entry is handed to `ctx.waitUntil()`, so it never sits in the request's critical path, and concurrent requests that see the same stale entry share one revalidation.

A new org goes to the shard `pick({ orgId, counts, totalShards })` names, where `counts` maps each D1 shard to its live orgs (a shard with none is absent). It may be async. The default takes the shard with the most headroom under `maxOrgsPerShard`, the lowest on a tie. When `pick` names none, allocation throws `DatabaseError` `shards_full` (503); a shard outside `0` to `totalShards - 1` throws a `RangeError`. The counts are read before the insert, so isolates allocating at once can each take a shard's last place: `maxOrgsPerShard` is a soft cap. A new org's insert does nothing when another isolate inserted first, and the row read back afterwards is the winner's, so two isolates racing on an org's first request agree on one mapping. A soft-deleted org (`deleted_at` set) is revived on the shard it had, where its data is, without asking `pick`; `log` reports it as an allocation with `revived: true`.

To place orgs yourself, `place({ orgId, shardId }, deps, ctx)` writes the same way: the first writer wins, an org that has a row keeps its shard, and the mapping that stands is returned. `move({ orgId, shardId }, deps, ctx)` overwrites the mapping and invalidates it; moving the org's rows is yours. Your own writes on the core database for the move, such as its members' presence rows, go in `with`, prepared statements that run in one batch with the mapping's write, so the switch and they land together or not at all: `move({ orgId, shardId, with: [coreDb.prepare(…).bind(…)] }, deps, ctx)`. A failed batch writes nothing and invalidates nothing. `unplace(orgId, deps)` soft-deletes the mapping and invalidates it, and a later `place` or allocation revives the org on its shard.

`invalidate(orgId, kv)` clears this isolate's LRU entry after a manual remap, puts a tombstone under its own key (`shard-inv:<orgId>`) carrying a random nonce, and deletes the mapping from KV, so a router of an older version sharing the KV in a rolling deploy finds a plain miss; `move` and `unplace` call it, `move` after its own write commits, warming KV with the moved row tagged with the nonce. KV has no compare-and-set, and a read from a lagging replica can return the row from before a remap, so what counts is decided at read time, with no clock: while the tombstone lives (3 × `kvTtlSeconds`), a KV mapping is trusted only when it is tagged with its nonce. Any other, such as a fill that read before the remap or from a replica behind it, is a miss: the reader reads the primary and puts the mapping tagged. The isolate that invalidated holds the nonce itself, so it is never misled, even before KV shows the tombstone. Other isolates keep serving their LRU copy until it goes stale (`lruTtlMs`, 5 min), then revalidate from KV or the core table; an entry is never served past `lruHardTtlMs` (15 min). KV is a cache: a KV call that fails is logged, and a write that fails is skipped, so a `move` whose core write committed does not throw for it. A read that fails trusts nothing in KV, as a tombstone it could not read may be shadowing the mapping: the request reads the primary and caches what it read in its own LRU, never in KV. A `place` or revive in an isolate that holds a live tombstone for the org tags its KV write with it, so other isolates trust it. The outer bound: a replica still behind a remap 3 × `kvTtlSeconds` after it could cache the old shard again once the tombstone expires; D1's replicas lag by seconds. So a remap converges everywhere once the tombstone has reached a location (KV propagates in up to about 60 s), plus `lruTtlMs` for an isolate already holding the org: keep both shards readable for that long, or resolve with `resolveVerified(orgId, { coreDb, kv, present }, ctx)`. It resolves as `resolve` does, then asks `present(mapping)` whether the org's rows are on that shard; when they are not, it reads the primary past every cache. When the primary names the shard just probed (the rows may not be written yet), that mapping is returned with nothing written or logged; otherwise the org is invalidated, the primary read again, and that mapping, or `undefined` for an org since unplaced, returned without probing again, cached only when no `move` or `invalidate` in this isolate came meanwhile.

Tunables: `lruMaxSize` (1000), `lruTtlMs` (5 min), `lruHardTtlMs` (15 min), `kvTtlSeconds` (60), `missTtlMs` (5 s), `maxOrgsPerShard` (500), `pick`. The constructor throws a `RangeError` unless `totalShards` and `maxOrgsPerShard` are positive integers and `kvTtlSeconds` is an integer of at least 60, KV's floor for an expiration TTL: under it every put fails, so KV would cache nothing. An org id is at most 64 UTF-16 code units, the length `shard_map.org_id` holds (`ORG_ID_MAX_LENGTH`): `place`, `move` and `allocate` (so `resolveOrAllocate`) throw a `RangeError` for a longer one, and `resolve` answers it as a miss. A route that takes the org id from its path validates it first. Pass `log(event, data)` for a structured hook: `shard-router.hit` (`{ orgId, tier: "lru" | "kv" | "d1" }`, plus `stale` on an LRU hit), `shard-router.miss` (`{ orgId }`, also for an id longer than `shard_map.org_id`'s 64 characters, answered before KV, whose keys stop at 512 bytes), `shard-router.allocate` (`{ orgId, shardId }`, plus `revived: true` for a revived org, from allocation and `place`, once per row written: a `place` or allocation of an org already placed, or the isolate that lost a race to place it, logs none), `shard-router.move` (`{ orgId, shardId }`), `shard-router.reresolve` (`{ orgId, from, to }`, `to` undefined for an org since unplaced), `shard-router.kv.error` (`{ orgId, op: "get" | "put" | "delete", error }`) and `shard-router.revalidate.error` (`{ orgId, error }`). With no `log`, the two `.error` events go to `console.warn`; pass `log: () => {}` to mute them.

A list whose rows sit on several shards, such as a user's orgs across the shards they have presence on, is merged in memory. Build it once, `buildListQuery({ cursorScope, cursorSecret, merged: {}, parsed, table, … })` with its filter, search and `baseWhere` as for one database; read each shard with that one query, its `extras` selected (`applyListQuery` does it), and pass the rows of all of them with it to `paginateMerged(rowsPerShard, built)`, which returns `[items, pagination]` as `queryHelpers.paginate` does. The shards are SQLite: the merge orders as SQLite does, so a merged list over a Postgres table is a `TypeError` at build, as a merged Postgres derived list is. A merged list's query is paged by `paginateMerged` alone, and a single database's by `paginate` alone: the types keep them apart, and each refuses the other's as a 500 (`page_not_wired`), as it refuses a shard's rows that lack the count or the tiebreak. A cursor page reads the page and one more past the cursor from each shard; a page by number reads every row up to its end from each, as any shard may hold any of them, and each shard counts its part, so `pagination.count` is the whole list's and `page=N` gives page N. The merge orders as SQLite does: text by code point (its BINARY collation), numbers before text, the null placement the order names, then the id, so the merged list pages by number or by cursor exactly as one database holding every row would. That holds for sort keys under SQLite's default BINARY collation, which is every column drizzle declares: a column a migration declared `COLLATE NOCASE` or `RTRIM` orders each shard by its fold, which the merge cannot know. `paginateMerged` throws `sort_not_wired` (500) when a shard's own rows come back out of its order, but a case pair that sits on two shards is past seeing, so keep a merged list's sort keys BINARY. A sort key SQLite stores as INTEGER past ±(2^53 − 1) that the driver reads as a JS number (D1 always does, as does bun:sqlite by default) is already rounded, so two such keys on two shards could merge in the wrong order: `paginateMerged` refuses one as `sort_not_wired` (500), as it does such a tiebreak; read it as bigint (libsql's `intMode: "bigint"`, bun:sqlite's `safeIntegers`), or keep it within the bound. A REAL key past 2^53 is exact as a double and merges in order, and a REAL ±Infinity, which D1 reads as null, merges as itself. Its ids must be unique across the shards, as a cursor names one row by its id: `paginateMerged` throws `sort_not_wired` when two shards return the same id, though only for rows it was given. A cursor page serves no row at or before the cursor, and none past the earliest last row of a shard that read its whole page and one more, so a shard that resumed early, as one reading a NULL key's anchor does, neither repeats nor skips rows. Offset pages cost every shard the rows before them, so a page whose end passes `maxRowsPerShard` (1001 rows by default, `merged: { maxRowsPerShard }`) throws `page_too_deep` (400): page a deep merged list by cursor. A cursor names its row by value, never by reference, as only one shard holds the row a reference reads back: a sort key too long for a cursor is a 500 (`sort_not_wired`) on a page served by cursor that meets it, so a merged list's sort keys must fit the cursor. A page by number serves such a row: when it is the page's last row, the one its next cursor would be minted from, its `nextCursor` is `null` while `hasMore` still says there is a next page by number.
