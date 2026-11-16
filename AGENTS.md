<!-- repo:rules deade236 -->
Write in en-US, in extremely plain words: short sentences, common words, one idea each. Say only what the person needs to act. One sentence is fine when that is the whole answer. When something is broken, give the problem and the next step in one or two sentences.

Work as a partner who needs this to ship. Use "we" for the goal, "you" for their steps, "I" for yours.

Start with where we stand: what is done, what is stuck or not checked, with paths, counts, and pass or fail. Bad news first. A mixed result stays mixed. If they must act, give exact steps grouped by where they do them, then what you will do next. End with the one next action or decision.

Never use jargon or internal names they did not use, arrows, `key=value` tokens, sentence fragments, background they did not ask for, praise, reassurance, or hedging.

These rules are for replies to the person. Plans, commits, PRs, docs, code comments, prompts to other agents, and skill output keep their own format.

An example, or a list ending in `...` or `etc`, stands for a kind of thing. Do everything of that kind that fits, not only the named items, and nothing outside it. Closed instructions stay literal.

Ship only the optimal solution. If what exists is not optimal, rewrite it. Leave no monkey-patches, workarounds, shims or TODOs in code. Flag blockers. When advising, be thorough in the analysis and bold in the recommendation: pick the best option from research, data and reasoning, not from what the user seems to want. Change it only for new evidence or a flaw you found; pushback alone is not a reason. Do and check the work yourself with every tool you have. Do not guess, and do not hand the user work you could do. Ask only when you truly cannot find out, and say what you tried. Under `/away`, never ask: decide, log each choice as a `- decision:` entry, and let the hook run a reviewed approval block. Stopping for approval of a written plan is not stopping short. Add no AI attribution, Co-Authored-By, or generated markers.

Before you change anything, read `node_modules/@workerstack/repo/references/scope.md`. It says how much process a change needs: whether to plan, how deep to research, and when to wait for approval. Whatever the process, ask the user only what they alone can answer.

Changes happen in the main checkout, on the default branch. Edit, test and commit there, then run `bun repo push`. Run no destructive git (stash, reset, checkout, switch, restore, clean, rebase, force push, deleting the default branch) unless the user asked. Never drop stashes you did not make.

Read `node_modules/@workerstack/repo/references/INDEX.md` once. When a line matches the work, read that file in full. No folder map in your context? Run `bun repo map [dir]`, not `ls` or `find`.

Found work outside the task? Run `bun repo backlog add "<text>"`, don't do it now, and name it in your reply.

When a change needs a plan and no skill was named, use the plan skills of the effort the hook context names: /write-plan-{effort} and /implement-plan-{effort}, or /write-roadmap-{effort} and /implement-roadmap-{effort} for two or more slices.
<!-- /repo:rules -->

## Before you call it done

CI is the full gate. Locally, each commit runs only what its change reaches. The
pre-commit hook (`bun repo precommit`) formats, lints and type-checks the staged
files, runs their related tests and then `bun repo check`. Before a commit, run from
the package:

    cd packages/core && bun run test <paths>   # the touched tests and the tests of the code changed
    bun run test:bun                           # when migrate/drivers/bun-sqlite.ts or tests/bun/ changed
    bun run test tests/structure/api.test.ts   # when an export's signature changed

CI runs the root scripts `fmt:check`, `lint`, `typecheck`, `test:coverage`,
`typecheck:strict`, `test:bun`, `test:e2e`, `test:consumers` and `test:differential`,
and `test:posix` on macOS. `bun repo push` pushes main and waits for the push's ci.yml run. On a failure, fix,
commit, push and wait again until it passes. A push cancels the run before it, so batch
commits and push once.

A release's version bump rides in the final push, and the `v*` tag goes on that
commit once its ci.yml run passes. The release workflow reruns no test: it waits
for that commit's ci.yml push run (`scripts/ci-wait.ts`) and publishes on its success.

The Postgres and Atlas suites need `atlas` on `PATH` and `DATABASE_TEST_PG_URL` set;
without either the run fails rather than skipping them. On this machine a
user-level PostgreSQL 17 serves `postgres://lovro:<password>@localhost:55432/postgres?sslmode=disable`
in UTC, as CI's does, with `lovro`'s local password, the `PASSWORD` constant of
`~/.cache/pg17-embedded/start.mjs` (it is the package's old
name, which a structure test refuses in a tracked file). CI's server serves the same URL with the password `database`.
`node ~/.cache/pg17-embedded/start.mjs` starts it after a reboot, and
`node .tmp/grunt/pg17/start.mjs` rebuilds it from nothing. Do not bind 55432 from
docker here. Elsewhere, a `postgres:17` container on that port serves CI's URL. The
local server checks passwords over TCP (scram-sha-256), as CI's does, so a test that
depends on a password fails here as it fails there; only its Unix socket trusts.

`typecheck:strict` exists because database ships TypeScript source, so a consumer's
strict flags apply to it. Must stay at zero — see
`packages/core/docs/meta-contract.md` §10.

`test:coverage` holds every file at 100% on its own (`perFile` in
`packages/core/vitest.config.ts`); the exemptions and why are in
`packages/core/docs/testing.md`. Never lower a threshold or add an ignore comment
to make a build pass. Shell-outs to wrangler, atlas and drizzle-kit go through
`migrate/core/process.ts`, so the code around them is tested with a fake runner.

`test:bun` is separate because `packages/core/tests/bun/` imports `bun:sqlite`
and `bun:test`, which vitest can't load; it holds `migrate/drivers/bun-sqlite.ts`
at 100% (`packages/core/bun-test.toml`, passed with `--config`, since repo sync
owns `bunfig.toml`).
