---
name: stdout-spy-misses-console
paths: ["packages/core/src/**/*.test.ts","packages/core/tests/**/*.test.ts"]
hits: 1
last-hit: 2026-11-15
evidence: ["plan 29"]
---

# A stdout spy never sees console.log under vitest

## Mistake
A test spied on `process.stdout.write` to prove nothing printed, but the fake wrangler printed with `console.log`. Vitest intercepts console calls before stdout, so the spy saw nothing and the test passed with the fix undone.

## Fix
A fake that a stdout check guards prints with `process.stdout.write`, which the spy sees. Prove the check by undoing the fix and watching it go red before trusting it.
