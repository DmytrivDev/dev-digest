# Insights — e2e

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

## What Doesn't Work

- **2026-09-16** — A flow cannot assert a per-run COST or a severity breakdown today: the seed ships PRs, agents, a review and its findings, but NO priced `agent_runs`, so those UI surfaces render the em dash in a freshly-seeded stack. A flow that waits for a concrete `$0.0039` would fail on CI while passing on a developer machine that has real runs in its DB. Assert the column header and the "—" empty state instead, and only assert a value once the seed creates runs with `cost_usd`. Evidence: `server/src/db/seed.ts:225`, `e2e/docs/adding-a-flow.md:30`.

## Codebase Patterns

## Tool & Library Notes

- **2026-09-18** — Do NOT follow CLAUDE.md's 'pnpm typecheck + pnpm test in the package you touched' literally here: `e2e`'s `test` script is `tsx run.ts` — a LIVE browser runner that expects the whole stack already up (API :3001 + web :3000 + a migrated, seeded Postgres), not a unit suite. Running it casually after an e2e edit hangs or fails on connection, and the failure looks like a broken test rather than a missing stack. The safe per-package check here is `npm run typecheck` alone; to actually run the flows use `npm run e2e:hermetic` (= `../scripts/e2e.sh`), which brings up its own isolated stack on alternate ports (PG 5433 / API 3101 / web 3100) and tears it down. Note the package is npm, not pnpm. Any automated gate that shells out per touched package must special-case e2e for this reason. Evidence: `e2e/package.json:5`, `scripts/e2e.sh:1`.
- **2026-09-18** — Even the SAFE per-package check (`npm run typecheck`) cannot run here on a normal dev machine: `scripts/dev.sh` installs deps in server, client and reviewer-core only (`install_if_needed server`/`client` at :76-77, `npm ci` for reviewer-core at :80) and NEVER in e2e, so `e2e/node_modules` is simply absent and the script dies with "'tsc' is not recognized as an internal or external command", exit 1. The failure mode is the dangerous part: an automated per-package gate reads that non-zero exit as a TYPECHECK FAILURE (blocking/CRITICAL) when the truth is missing tooling — hit today by `/pr-self-review`, which routes e2e into `packages_touched` for a change to `e2e/INSIGHTS.md` alone, i.e. with no TypeScript in scope at all. Distinguish 'command could not run' from 'command failed' before blocking, and fix with `cd e2e && npm ci` (npm, not pnpm). Evidence: `scripts/dev.sh:76`, `e2e/package.json:5`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
