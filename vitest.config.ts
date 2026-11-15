import { defineConfig } from "vitest/config";

// The root holds no tests of its own: its scripts are tested by packages/core's suites, which the root runs as its
// one project, so `vitest related` on a root file finds them and never walks the gitignored scratch trees.
export default defineConfig({ test: { projects: ["packages/core"] } });
