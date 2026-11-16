/**
 * Every runtime subpath, bundled and run (KT2 of r23): a Worker that imports each one, reads every
 * export it has and runs a list query on D1, bundled by esbuild, `bun build`, Vite and wrangler, and
 * each bundle run on workerd through Miniflare with a D1 bound. A bundle that builds but drops an
 * export, breaks one's module or cannot run on workerd fails here, where peers.consumer.test.ts
 * reads only the bundle's text. esbuild is the one wrangler installs for itself.
 */
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RUNTIME } from "./fixture.ts";
import { installedVersion, ok, pack, run, type Stage, stage } from "./stage.ts";

const CORE = join(import.meta.dirname, "../..");

const manifest = JSON.parse(readFileSync(join(CORE, "package.json"), "utf8")) as {
  exports: Record<string, { default: string }>;
};

/** The Worker: each runtime subpath's export names whose value is defined, and one page of a list on D1 */
const WORKER = `import { getTableColumns } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { createListQuerySchema, queryHelpers } from "@workerstack/database/query"
import { applyListQuery, buildListQuery } from "@workerstack/database/query/sqlite"
${RUNTIME.map((spec, i) => `import * as m${i} from "${spec}"`).join("\n")}

const modules: Record<string, Record<string, unknown>> = {
${RUNTIME.map((spec, i) => `\t${JSON.stringify(spec)}: m${i},`).join("\n")}
}
const post = sqliteTable("post", { id: integer("id").primaryKey(), title: text("title").notNull() })
const schema = createListQuerySchema({ pagination: { defaultLimit: 2, maxLimit: 2 }, sort: ["title"] })

export default {
	async fetch(_request: Request, env: { CURSOR_SECRET: string; DB: D1Database }): Promise<Response> {
		const exports = Object.fromEntries(
			Object.entries(modules).map(([spec, m]) => [spec, Object.keys(m).filter((name) => m[name] !== undefined).sort()]),
		)
		await env.DB.batch([
			env.DB.prepare("CREATE TABLE post (id INTEGER PRIMARY KEY, title TEXT NOT NULL)"),
			env.DB.prepare("INSERT INTO post VALUES (1, 'c'), (2, 'a'), (3, 'b')"),
		])
		const parsed = schema.parse({ order: "title.asc" })
		const list = buildListQuery({ cursorScope: "post:list", cursorSecret: env.CURSOR_SECRET, parsed, table: post })
		const db = drizzle(env.DB)
		const rows = await applyListQuery((extras) => db.select({ ...getTableColumns(post), ...extras }).from(post), list)
		const [items, meta] = queryHelpers.paginate(rows as Array<{ title: string }>, list)
		return Response.json({ exports, hasMore: meta.hasMore, titles: items.map((row) => row.title) })
	},
}
`;

// each bundler, the command that bundles src/runtime.ts, and the module it writes
const BUNDLERS = [
  [
    "esbuild",
    [
      "esbuild",
      "src/runtime.ts",
      "--bundle",
      "--format=esm",
      "--platform=browser",
      "--conditions=workerd,worker",
      "--outfile=dist-esbuild/runtime.js",
    ],
    "dist-esbuild/runtime.js",
  ],
  [
    "bun build",
    // bun reads a comma list as one condition's name, so each is a flag of its own
    [
      "bun",
      "build",
      "src/runtime.ts",
      "--target=browser",
      "--conditions=workerd",
      "--conditions=worker",
      "--outdir=dist-bun",
    ],
    "dist-bun/runtime.js",
  ],
  ["Vite", ["vite", "build", "--ssr", "src/runtime.ts"], "dist-vite/runtime.js"],
  ["wrangler", ["wrangler", "deploy", "--dry-run", "--outdir", "dist-wrangler"], "dist-wrangler/runtime.js"],
] as const;

/** What each runtime subpath exports, as database's own source has it */
async function sourceExports(): Promise<Record<string, string[]>> {
  const entries = await Promise.all(
    RUNTIME.map(async (spec) => {
      const key = spec === "@workerstack/database" ? "." : `./${spec.slice("@workerstack/database/".length)}`;

      const loaded = (await import(join(CORE, (manifest.exports[key] as { default: string }).default))) as Record<
        string,
        unknown
      >;

      return [
        spec,
        Object.keys(loaded)
          .filter((name) => loaded[name] !== undefined)
          .toSorted(),
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

let app: Stage;
let tarball: string;

beforeAll(() => {
  tarball = pack();
  app = stage(tarball, "required", {
    "src/runtime.ts": WORKER,
    // the conditions @cloudflare/vite-plugin resolves a Worker with
    "vite.config.mjs": `export default { build: { outDir: "dist-vite" }, ssr: { noExternal: true, resolve: { conditions: ["workerd", "worker"], externalConditions: ["workerd", "worker"] }, target: "webworker" } }\n`,
    "wrangler.toml": 'name = "runtime"\nmain = "src/runtime.ts"\ncompatibility_date = "2026-10-01"\n',
  });
  console.log(`[database] the runtime cell bundles with esbuild@${installedVersion(app.dir, "esbuild")}`);
});

afterAll(() => {
  app?.dispose();

  if (tarball !== undefined) rmSync(dirname(tarball), { force: true, recursive: true });
});

describe("every runtime subpath, bundled and run on workerd with D1", () => {
  it.each(BUNDLERS)("runs %s's bundle, every export there and the list query answered", async (_bundler, args, out) => {
    const [cmd, ...rest] = args[0] === "bun" ? args : ["npx", "--no-install", ...args];
    ok(run(app.dir, cmd, rest), args.join(" "));
    const scriptPath = join(app.dir, out);

    // a date every workerd binary takes, so the test does not follow miniflare's version
    const worker = new Miniflare({
      bindings: { CURSOR_SECRET: "a cursor secret of thirty-two bytes or more" },
      compatibilityDate: "2025-01-01",
      d1Databases: ["DB"],
      modules: true,
      modulesRoot: dirname(scriptPath),
      scriptPath,
    });

    try {
      const response = await worker.dispatchFetch("http://database.test/");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ exports: await sourceExports(), hasMore: true, titles: ["a", "b"] });
    } finally {
      await worker.dispose();
    }
  });
});
