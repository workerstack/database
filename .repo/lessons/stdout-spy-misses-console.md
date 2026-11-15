---
name: stdout-spy-misses-console
paths: ["packages/core/src/**/*.test.ts","packages/core/tests/**/*.test.ts"]
hits: 1
last-hit: 2026-11-15
evidence: ["plan 29"]
---

# A stdout spy never sees console.log under vitest

## Mistake
The KC1 test's fake wrangler printed with `console.log`. Vitest intercepts console calls before they reach `process.stdout.write`, so the spy saw nothing either way and the "prints nothing" assertion could not fail.

## Fix
A fake that a stdout check guards prints with `process.stdout.write`, which the spy sees. Prove the check by undoing the fix and watching it go red before trusting it.
