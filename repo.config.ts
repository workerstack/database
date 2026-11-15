import { defineConfig } from "@workerstack/repo";

export default defineConfig({
  link: { "@workerstack/repo": "../workerstack/repo" },
  workflow: "main",
  packs: ["agents", "standards", "docs", "benchmark"],
  agents: { hosts: ["claude", "codex", "antigravity", "grok", "cursor"] },
  knip: {
    ignore: [
      {
        binary: "atlas",
        reason: "the Atlas CLI comes from its own installer onto PATH, as CI's setup step and AGENTS.md give it",
      },
      {
        dependency: "drizzle-kit",
        reason: "an optional peer that optional-peer.ts resolves by name at run time, and the migrate tests run it",
      },
      { file: "scripts/ci-wait.ts", reason: "the release workflow runs it through .github/scripts/release-ci-gate.sh" },
      { file: "scripts/registries.ts", reason: "run by hand to rewrite the generated src/formats registry modules" },
      {
        file: "packages/core/src/typescript-floor-types.ts",
        reason: "each export's plain types condition names its emitted declaration in types/",
      },
      {
        file: "packages/core/tests/types/*.typetest.ts",
        reason: "type tests that tsc checks through tsconfig.json; nothing imports them",
      },
      {
        file: "packages/core/tests/structure/support/write-*.ts",
        reason: "snapshot writers run by hand with bun, as their headers say",
      },
      {
        file: "packages/core/tests/integration/support/apply-child.ts",
        reason: "a child process the integration tests spawn by path",
      },
      {
        file: "packages/core/tests/integration/support/replay-child.ts",
        reason: "a child process replay-check.ts spawns by path",
      },
      {
        file: "packages/core/tests/integration/support/run-window.ts",
        reason: "a child process run-lock.test.ts spawns by path",
      },
      {
        file: "packages/core/tests/differential/support/entry-*.ts",
        reason: "each released version's entry, which oracles.ts copies and the tests import by URL",
      },
    ],
  },
  lint: {
    plugins: { database: "packages/core/lint/index.js" },
    rules: [
      {
        files: [
          "packages/core/src/**",
          "packages/core/lint/**",
          "packages/core/tests/integration/**",
          "packages/core/tests/structure/**",
        ],
        rules: {
          "database/boundaries": "error",
          "database/export-name": "error",
          "database/no-console": "error",
          "database/no-locale-compare": "error",
          "database/no-module-side-effects": "error",
          "database/no-module-state": "error",
          "database/no-review-label": "error",
          "database/no-silent-catch": "error",
          "database/no-v8-ignore": "error",
          "database/optional-undefined": "error",
          "database/public-jsdoc": "error",
          "database/raw-sql-allowlist": "error",
        },
      },
      {
        files: ["packages/core/src/**/*.test.ts", "packages/core/lint/**/*.test.ts", "packages/core/tests/**"],
        rules: { "database/no-spawned-kill": "error" },
      },
    ],
  },
});
