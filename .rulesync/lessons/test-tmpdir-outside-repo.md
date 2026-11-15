---
name: test-tmpdir-outside-repo
paths: ["packages/core/vitest.config.ts","packages/core/lint/**"]
hits: 1
last-hit: 2026-11-15
evidence: ["plan 29"]
---

# A full test run's scratch stays outside the repo and off a full /tmp

A local coverage run died twice on where its scratch went, and its numbers were void both times.

## Mistake
On this machine `/tmp` is a 32G tmpfs that other sessions share. The full suite's mkdtemp scratch
filled it, and 521 of 802 files died on ENOSPC. Moving `TMPDIR` into `packages/core/.tmp/` then failed
20 lint and migrate files, because their scratch projects resolved the repo's own config above them.

## Fix
Check `df -h /tmp` before a full local run. When it is short, set `TMPDIR` to a directory on `/home`
outside the repo (`/home/lovro/.cache/database-tmp`). Read a run's failures before its coverage: a
coverage table from a run with environment failures measures nothing.
