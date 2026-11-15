---
name: stdout-spy-misses-console
paths: ["packages/core/src/**/*.test.ts","packages/core/tests/**/*.test.ts"]
hits: 1
last-hit: 2026-11-15
evidence: ["plan 29"]
---

# A stdout spy never sees console.log under vitest

A test that spies on `process.stdout.write` to prove nothing printed passed with the fix undone.

## Mistake
The KC1 unit test's fake wrangler printed with `console.log`. Vitest intercepts console calls before
they reach `process.stdout.write`, so the spy saw nothing whether or not the read ran in database's
process, and the "prints nothing" assertion could not fail.

## Fix
A fake that a stdout check guards prints with `process.stdout.write`, which the spy sees. Prove the
check by undoing the fix and watching it go red before trusting it.
