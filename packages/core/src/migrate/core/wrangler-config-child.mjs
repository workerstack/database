/**
 * The wrangler config read's child: the checked wrangler's own `unstable_readConfig`, run on node through
 * node-child.ts, so what the reader prints, a warning on a key it does not know and the newer-version
 * notice, stays out of database's stdout. It answers the D1 bindings the config holds for the
 * environment asked, or the reader's message when it refuses the config. Plain JavaScript: node does not
 * strip a TypeScript file's types under node_modules, where a project holds database.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @typedef {import("./wrangler-config-child.d.mts").ConfigInput} ConfigInput
 * @typedef {import("./wrangler-config-child.d.mts").ConfigAnswer} ConfigAnswer
 */

/**
 * The D1 bindings of the config `input` names, as the wrangler at `input.wrangler` reads it
 * @param {ConfigInput} input
 * @returns {Promise<ConfigAnswer>}
 */
export async function readConfig(input) {
  const wrangler =
    /** @type {{ unstable_readConfig(args: { config: string; env?: string }): { d1_databases: unknown[] } }} */ (
      await import(pathToFileURL(input.wrangler).href)
    );

  try {
    const { d1_databases } = wrangler.unstable_readConfig({ config: input.config, env: input.env });

    return { config: { d1_databases } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The read of the input JSON at `input`, as d1-binding.ts writes it
 * @param {string} input
 * @returns {Promise<ConfigAnswer>}
 */
export async function main(input) {
  return await readConfig(/** @type {ConfigInput} */ (JSON.parse(readFileSync(input, "utf8"))));
}
