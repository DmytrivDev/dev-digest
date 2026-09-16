# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

## What Doesn't Work

- **2026-09-15** — A clean checkout cannot boot the API with `scripts/dev.sh` alone: it installs deps only in `server/` and `client/`, never in `reviewer-core/`. The server imports reviewer-core SOURCE through a tsconfig alias (`server/tsconfig.json:24`), so Node resolves that file's bare imports upward from `reviewer-core/src/llm/` and NEVER reaches `server/node_modules` — they are sibling dirs, not nested. Boot dies on `ERR_MODULE_NOT_FOUND: Cannot find package 'openai' imported from reviewer-core/src/llm/structured.ts`. Fix: run `npm ci` in `reviewer-core/` (npm, not pnpm — it carries a `package-lock.json`).
- **2026-09-15** — A single failed background job KILLS the whole API process. `JobRunner.enqueue` marks the row `status:'failed'` and then RETHROWS (`server/src/platform/jobs.ts`, catch block), which rejects the returned `done` promise — but every call site awaits only `enqueue(...)` itself (which resolves immediately with `{id, done}`) and never attaches a handler to `done`. Under Node 22's default `--unhandled-rejections=throw` the process exits. Concrete trigger: the seeded demo repo `acme/payments-api` does NOT exist on GitHub, so any clone / refresh / reindex on it fails with `GitError: Repository not found` and takes :3001 down. The symptom is deeply misleading — Next.js on :3000 still serves 200, so the UI renders with empty lists and looks like the DATABASE was wiped, while every row is actually intact. Diagnose with `curl localhost:3001/health` before suspecting data loss. Evidence: `server/src/platform/jobs.ts`, `server/src/modules/repos/service.ts:98,117`.

## Codebase Patterns

- **2026-06-14** — Shared contracts (`@devdigest/shared`) are vendored as TWO hand-maintained copies — `server/src/vendor/shared/` and `client/src/vendor/shared/` — resolved by tsconfig path alias, NOT auto-synced. Adding a field means editing both in lock-step; the only diffs between copies are comments. Evidence: `server/src/vendor/shared/contracts/trace.ts`, `platform.ts`.
- **2026-06-14** — PR-list per-PR aggregates (score, cost) are computed ON READ in `GET /repos/:id/pulls` via one `inArray` query + JS grouping, never denormalized onto `pull_requests`. "Latest review batch" cost has no batch id in the schema — approximated by summing `agent_runs.cost_usd` within a 120s window of the PR's newest priced run. Evidence: `server/src/modules/pulls/routes.ts`.
- **2026-06-14** — `completeAgentRun`'s `values` shape is declared in TWO places that must match: the repo fn (`repository/run.repo.ts`) AND the interface wrapper (`repository.ts:151`). Adding a field (e.g. `costUsd`) needs both or typecheck fails.

## Tool & Library Notes

- **2026-06-14** — New DB columns: edit `db/schema/*.ts`, then `npm run db:generate` (drizzle-kit) auto-generates `00NN_*.sql` (e.g. `0010_solid_baron_zemo.sql` = `ALTER TABLE … ADD COLUMN`). Never hand-write migration SQL; apply with `npm run db:migrate`.

## Recurring Errors & Fixes

- **2026-06-14** — Adding a required field to a Zod contract (`RunStats.cost_usd`) breaks the inline fixture in `server/test/contracts.test.ts` (RunTrace parse). Update the `stats: {…}` fixture in the same change. Evidence: `server/test/contracts.test.ts:160`.
- **2026-09-15** — `pnpm db:migrate` / `pnpm db:seed` silently do NOTHING on Windows yet exit 0: the CLI guard `import.meta.url === `\file://${process.argv[1]}`\` never matches, because argv[1] is `D:\Work\...\migrate.ts` (backslashes + drive letter) while `import.meta.url` is `file:///D:/Work/.../migrate.ts`. Symptom: output is just the `$ tsx src/db/migrate.ts` line with no `✓ migrations applied`, and `\dt` reports "Did not find any relations". Fix: `import.meta.url === pathToFileURL(process.argv[1]).href` (byte-identical behavior on POSIX). Evidence: `server/src/db/migrate.ts:37`, `server/src/db/seed.ts:227`.
- **2026-09-15** — A fresh `cp server/.env.example server/.env` (exactly what `scripts/dev.sh` does) produces an API that CRASHES at boot: the example ships `LOG_LEVEL=` with an empty value, dotenv turns that into the string "", and `z.enum([...]).optional()` rejects it — `.optional()` admits `undefined`, never an empty string. Failure is a Zod `invalid_enum_value` on `path: [LOG_LEVEL]`. Fix: comment the line out or set a real level. Evidence: `server/src/platform/config.ts:33`, `server/.env.example`.

## Session Notes

### 2026-06-14
- Re-introduced per-run cost (USD) end-to-end (lesson reversing the earlier removal in `d45ab0d`/`58c6ac7`): `cost_usd` column on `agent_runs` (migration 0010), captured in `run-executor` (was discarding `outcome.costUsd`), surfaced in `RunSummary`/`RunStats`/`PrMeta`.
- Decision: PR-list COST = sum of the latest review batch via a 120s window heuristic (no batch id in schema). Cost persisted (accurate `outcome.costUsd`), not recomputed; historical runs → null → "—".

## Open Questions

- **2026-06-14** — PR-list "latest review batch" uses a 120s `ranAt` window as a proxy for a review session. If a real review-session / batch id is ever added to the schema, swap the window for exact grouping in `pulls/routes.ts`.
