---
name: test-tmpdir-outside-repo
paths: ["packages/core/vitest.config.ts","packages/core/lint/**"]
hits: 1
last-hit: 2026-11-15
evidence: ["plan 29"]
---

# A full test run's scratch stays outside the repo and off a full /tmp

## Mistake
`/tmp` here is a shared 32G tmpfs. The full suite's mkdtemp scratch filled it and 521 of 802 files died on ENOSPC. `TMPDIR` in `packages/core/.tmp/` then failed 20 lint and migrate files, whose scratch projects read the repo's config.

## Fix
Check `df -h /tmp` before a full local run. When it is short, set `TMPDIR` to a directory on `/home` outside the repo (`/home/lovro/.cache/database-tmp`). Read a run's failures before its coverage: a run with environment failures measures nothing.
