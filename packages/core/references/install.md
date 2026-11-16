---
description: Install
order: 20
---

# Install

```bash
bun add @workerstack/database drizzle-orm@1.0.0-rc.4 zod @noble/ciphers @noble/hashes
```

```bash
npm install @workerstack/database drizzle-orm@1.0.0-rc.4 zod @noble/ciphers @noble/hashes
```

```bash
pnpm add @workerstack/database drizzle-orm@1.0.0-rc.4 zod @noble/ciphers @noble/hashes
```

@workerstack/database ships TypeScript source, not a build, and the declarations a type checker reads. Your bundler or runtime compiles the source; your `tsc` and editor read the declarations under `types/`, so your project needs no tsconfig flag for database, and your strict flags check your code, not database's. Go-to-definition still opens database's source, through the declarations' maps.

| Runtime or tool | Supported | How                                                                                                                                             |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun             | yes       | runs the source directly                                                                                                                        |
| `tsx`           | yes       | runs the source on Node                                                                                                                         |
| Vite            | yes       | bundles it; set `ssr.noExternal` for an SSR or Worker build                                                                                     |
| Wrangler        | yes       | bundles it into the Worker                                                                                                                      |
| `tsc`, editors  | yes       | TypeScript 5.7 or later reads the declarations under `types/`, in any `moduleResolution` that reads `exports` (`bundler`, `node16`, `nodenext`) |
| plain Node      | no        | type stripping refuses TypeScript in dependencies (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`); run it through `tsx` or a bundler            |

On Node, database needs 22.13 or later (`engines.node` says so): its SQLite and D1 migration commands read SQLite through `node:sqlite`, a built-in from 22.13 on, and database refuses an older Node by name, with its version, before it opens one. Bun needs no Node.

The consumer suite (`bun run test:consumers`) checks each supported row in CI: it installs the packed tarball, imports every subpath under Bun and `tsx`, builds with Vite and Wrangler, compiles every subpath with `tsc` under strict flags in a `bundler` and a `nodenext` project and on TypeScript 5.7.2, database's floor, checks that TypeScript 5.6 fails at each import of database, and type-checks a stock create-cloudflare Worker, its tsconfig verbatim, from the declarations alone. An install that skipped packing, such as a `file:` or link install of this repository or a git dependency, has no `types/`; `tsc` then reads the source, as before 0.19, which needs `allowImportingTsExtensions`.

The runtime subpaths (all but `cli`, `codegen` and `migrate`) type-check at `lib` ES2022, the floor create-cloudflare's templates give; the tooling subpaths, which run under Bun or Node, need ES2023.

Peer dependencies:

| Package          | Range                                    | Required                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle-orm`    | `1.0.0-rc.4 \|\| 1.0.0-rc.5 \|\| ^1.0.0` | yes — the relational API (`defineRelations`) is v1-only                                                                                                                                                                                                                                                                                     |
| `zod`            | `>=4.6.0 <5`                             | yes — every schema module builds on it                                                                                                                                                                                                                                                                                                      |
| `@noble/ciphers` | `>=2.0.0 <3`                             | yes — cursors are sealed with its XChaCha20-Poly1305                                                                                                                                                                                                                                                                                        |
| `@noble/hashes`  | `>=2.0.0 <3`                             | yes — the cursor key is derived with its HKDF-SHA256                                                                                                                                                                                                                                                                                        |
| `ts-morph`       | `>=28.0.0 <29`                           | only for codegen (resolves imports, and loads TypeScript under node), and for `database migrate diff` on a SQLite database whose database.config.ts declares FTS, to read its tables file                                                                                                                                                   |
| `typescript`     | `>=5.7.2`                                | only to type-check against database: the declarations under `types/` need TypeScript 5.7 or later, and 5.6 fails at each import of database                                                                                                                                                                                                 |
| `@libsql/client` | `>=0.17.4 <0.18`                         | only for `database migrate apply`, `baseline`, `check` and `status` on libsql and Turso                                                                                                                                                                                                                                                     |
| `drizzle-kit`    | `1.0.0-rc.4 \|\| 1.0.0-rc.5 \|\| ^1.0.0` | only for `database migrate diff`, which runs `drizzle-kit export`                                                                                                                                                                                                                                                                           |
| `wrangler`       | `>=4.147.0 <5`                           | only for `database migrate apply`, `baseline`, `check` and `status` on D1, which wrangler applies                                                                                                                                                                                                                                           |
| `libpg-query`    | `>=17.7.4 <18`                           | only for `database migrate apply`, `baseline`, `check` and `diff` on Postgres: database reads each statement with it                                                                                                                                                                                                                        |
| `postgres`       | `>=3.4.9 <4`                             | only for `database migrate baseline` on Postgres, to read what Atlas OSS leaves out, and for `check` to replay the history and the pending files on a postgres:// devUrl (without it, check rates the files alone and says so), and for `apply` to sweep what a killed check left on a postgres:// devUrl's server                          |
| `atlas`          | `>=1.2.0 <2`                             | only for `database migrate apply`, `baseline`, `check` and `diff` on bun:sqlite, libsql and Turso; `database migrate apply`, `check` and `diff` on D1; `database migrate apply`, `baseline`, `check`, `diff` and `status` on Postgres: no package ships it, so install it from [atlasgo.io](https://atlasgo.io/getting-started) onto `PATH` |

The D1 modules (`sqlite/d1/*`) take a D1 binding, or a session of one, by the methods they call, and hand a session back in the binding's own type, so a Worker typed by `wrangler types` and one typed by `@cloudflare/workers-types` both use them, and database needs neither.

Each range stops before the next breaking release, and database refuses an optional peer outside its range, naming the version it found, so database never runs on a major it was not tested against. database finds `wrangler` and `drizzle-kit` in the project, from the working folder up, the way Node finds a package, and runs the one it checked by its own bin path: `wrangler` on `node`, and `drizzle-kit` on the runtime running database (Bun from the `database` binary, Node under `runCli` in a Node process), so neither needs to be on `PATH`, and in a workspace database runs the copy the workspace itself installed. Each `database migrate` command names every optional peer it needs and lacks before it connects, fetches, starts a process or asks Atlas anything, with one install line whose quoted ranges land inside database's (`bun add <peer>` alone takes the newest release, which may be the next major). Atlas is one of them: database reads `atlas version` first, and refuses an Atlas missing from `PATH` or outside `>=1.2.0 <2` in the same refusal, with its install page, as it refuses a SQLite `diff` whose database.config.ts declares FTS without `ts-morph`. Drizzle's ranges name each tagged release candidate, 1.0.0-rc.4 and 1.0.0-rc.5, which the consumer suite type-checks database against one by one, then `^1.0.0`, not a `>=` range: drizzle also publishes a `1.0.0-rc.N-<hash>` build of every branch, which a `>=1.0.0-rc.4` range admits and ranks above the tagged one, and its `latest` tag is still 0.x, so the install lines pin `drizzle-orm@1.0.0-rc.4`.

Its schemas are plain Zod; none is compiled. A Worker refuses the code a compiled schema builds (`new Function`), so there the compiler only added to the bundle. A Node or Bun app that wants compiled parsing opts in with `import "zod/compile"` as the first import of its entry: every schema built after it, database's included, compiles on its first parse, and one the compiler cannot take keeps Zod's own parser. Zod 4.5.4 is the first release with that import.

The migration toolkit also shells out to [Atlas](https://atlasgo.io) `>=1.2.0 <2`, which no package ships: `database migrate diff`, `check` and `apply` need it on `PATH`, `baseline` too on every provider but D1, and `status` on Postgres. When the project has no `drizzle-kit` or `wrangler` in range, database names the package, its range and the install; when `node` is missing to run `wrangler`, database names it.
