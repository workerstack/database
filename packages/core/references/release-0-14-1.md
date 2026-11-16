---
description: 0.14.1
order: 280
---

# 0.14.1

A fix with nothing to change: deploy it over 0.14.0, with no regenerate. The shard router's `invalidate` (and so `move` and `unplace`) leaves its KV tombstone under its own key, `shard:<orgId>:inv`, and deletes the mapping's key, `shard:<orgId>`. 0.14.0 put the tombstone in the mapping's key, where a 0.13.x router sharing the KV during a rolling deploy read it as a mapping with no shard. A tombstone 0.14.0 left there is still a miss, so 0.14.0 and 0.14.1 workers can share one KV namespace.
