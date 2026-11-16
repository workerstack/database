/** What d1-binding.ts hands the wrangler config read's child, as JSON */
export type ConfigInput = {
  /** The wrangler config file */
  config: string;
  /** The wrangler environment, if one is asked */
  env?: string | undefined;
  /** The checked wrangler's entry module */
  wrangler: string;
};

/** What the child answers: the config's D1 bindings, or the message wrangler's reader refused it with */
export type ConfigAnswer = { config: { d1_databases: unknown[] } } | { error: string };

export function readConfig(input: ConfigInput): Promise<ConfigAnswer>;
export function main(input: string): Promise<ConfigAnswer>;
