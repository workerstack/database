import { defineConfig } from "@workerstack/repo";

const CORE_LINTED = [
  "packages/core/src/**",
  "packages/core/lint/**",
  "packages/core/tests/integration/**",
  "packages/core/tests/structure/**",
];

export default defineConfig({
  packs: ["agents", "standards", "docs"],
  link: { push: "allow" },
  workflow: "main",
  agents: {
    defaultApproval: "ask",
    defaultEffort: "fast",
    defaultStrategy: "spawn-fast",
    hosts: ["claude", "codex", "antigravity", "grok", "cursor"],
  },
  knip: {
    ignore: [
      {
        binary: "atlas",
        reason: "Atlas is a system binary the migrate tests spawn, installed by its own script, not npm",
      },
      {
        file: "packages/core/src/typescript-floor-types.ts",
        reason:
          "the typesVersions fallback for a compiler older than 5.7 names its emitted .d.ts, which knip does not follow",
      },
      {
        file: "packages/core/tests/types/*.typetest.ts",
        reason: "tsc compiles the type-level tests under typecheck; nothing imports or runs them",
      },
      {
        file: "packages/core/tests/differential/support/entry-{bun,cli}.ts",
        reason: "the differential suites import each version's entry by a path they build at run time",
      },
      {
        file: "packages/core/tests/integration/support/{apply-child,replay-child,run-window}.ts",
        reason: "the integration tests spawn these as child processes by path",
      },
      {
        file: "packages/core/tests/structure/support/write-{peer-registry,released-exports}.ts",
        reason: "run by hand to rerecord what the structure tests compare against",
      },
      {
        file: "packages/core/tests/e2e/support/blog-tables.ts",
        reason: "copied into each e2e app as its tables module, which codegen loads by path",
      },
      { file: "scripts/ci-wait.ts", reason: "the release gate shell script runs it with bun by path" },
      {
        file: "packages/core/tests/bun/support/utc.ts",
        reason: "bunfig.test.toml preloads it for bun test, and knip reads only bunfig.toml",
      },
      {
        dependency: "oxlint",
        reason: "lint/rule-harness.ts runs its bin by the path createRequire resolves, which knip does not read",
      },
      {
        dependency: "drizzle-kit",
        reason: "the migrate tests run its bin through the peer lookup, which resolves a path, not an import",
      },
    ],
  },
  lint: {
    plugins: { database: "packages/core/lint/index.js" },
    rules: [
      {
        files: CORE_LINTED,
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
        rules: {
          "database/no-cleanup-probe": "error",
          "database/no-process-kill": "error",
          "database/no-spawned-kill": "error",
        },
      },
    ],
    skip: [
      {
        files: [
          "packages/core/src/codegen/utils/paths.ts",
          "packages/core/src/pg/columns.ts",
          "packages/core/src/query/filter-validate.ts",
          "packages/core/src/query/list-schema.ts",
          "packages/core/src/query/schema-params.ts",
          "packages/core/src/query/schema.ts",
          "packages/core/src/query/sqlite/build-list-query-types.ts",
          "packages/core/src/query/sqlite/list-finish.ts",
          "packages/core/src/sqlite/d1/sharding/types.ts",
        ],
        rules: ["repo/consistent-type-definitions", "typescript/no-duplicate-type-constituents"],
        reason:
          "these files spell declarations v0.26.0 shipped, which upgrade-exports.test.ts holds byte for byte " +
          "until the next release's upgrade section lists what changed, and the fix respells them " +
          "(| undefined off an optional parameter, " +
          "the ShardRouterConfig interface, which a consumer can merge into, made a type)",
      },
      {
        files: ["packages/core/src/**"],
        rules: ["typescript/no-unnecessary-type-arguments"],
        reason:
          "database ships src as TypeScript, and every tsconfig here loads ts-reset, " +
          "whose Map defaults to <unknown, unknown>; a consumer has no ts-reset, " +
          "so the fix's new Map<string>() fails its tsc with TS2743",
      },
      {
        files: ["packages/core/src/query/sqlite/search.ts"],
        rules: ["eslint/no-control-regex"],
        reason: "the search text drops control characters, since a NUL ends the C string FTS5 parses mid-phrase",
      },
      {
        files: ["packages/core/tests/support/pid.ts"],
        rules: ["database/no-process-kill"],
        reason: "pid.ts is the one place a test signals a process: it checks the pid's start time first",
      },
      {
        files: ["packages/core/src/migrate/core/cleanup.test.ts"],
        rules: ["database/no-cleanup-probe"],
        reason: "cleanup.ts's own test is where its isAlive probe is tested",
      },
    ],
  },
});
