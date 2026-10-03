# Insights — e2e

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

## What Doesn't Work

- **2026-09-16** — A flow cannot assert a per-run COST or a severity breakdown today: the seed ships PRs, agents, a review and its findings, but NO priced `agent_runs`, so those UI surfaces render the em dash in a freshly-seeded stack. A flow that waits for a concrete `$0.0039` would fail on CI while passing on a developer machine that has real runs in its DB. Assert the column header and the "—" empty state instead, and only assert a value once the seed creates runs with `cost_usd`. Evidence: `server/src/db/seed.ts:225`, `e2e/docs/adding-a-flow.md:30`.
- **2026-10-03** — On Windows ./scripts/e2e.sh fails before or during the flows for three environment reasons, none of them a test defect (seen 2026-10-03 running SPEC-03 flow 09). (1) The dev Postgres container devdigest-postgres may itself publish :5433 (server/.env DATABASE_URL=...:5433), so the script's default isolated port collides: 'Bind for 0.0.0.0:5433 failed: port is already allocated'. Run with E2E_PG_PORT=5440. (2) run.ts spawns AGENT_BROWSER_BIN with execFile and no shell, so the npm .cmd shim is not found and EVERY flow fails with 'spawn agent-browser ENOENT'. Point it at the native binary: AGENT_BROWSER_BIN='<npm prefix -g>/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'. (3) e2e.sh's cleanup uses pgrep/lsof, absent in Git Bash, and its next dev writes the SAME client/.next as a running dev server: afterwards the dev client fetched http://localhost:3101 (the e2e NEXT_PUBLIC_API_BASE compiled into the chunks) and the page hung on skeletons. Stop your dev web before e2e and rm -rf client/.next after it. Evidence: scripts/e2e.sh (PG_PORT default, cleanup), e2e/run.ts:40-50.

## Codebase Patterns

## Tool & Library Notes

- **2026-09-18** — Do NOT follow CLAUDE.md's 'pnpm typecheck + pnpm test in the package you touched' literally here: `e2e`'s `test` script is `tsx run.ts` — a LIVE browser runner that expects the whole stack already up (API :3001 + web :3000 + a migrated, seeded Postgres), not a unit suite. Running it casually after an e2e edit hangs or fails on connection, and the failure looks like a broken test rather than a missing stack. The safe per-package check here is `npm run typecheck` alone; to actually run the flows use `npm run e2e:hermetic` (= `../scripts/e2e.sh`), which brings up its own isolated stack on alternate ports (PG 5433 / API 3101 / web 3100) and tears it down. Note the package is npm, not pnpm. Any automated gate that shells out per touched package must special-case e2e for this reason. Evidence: `e2e/package.json:5`, `scripts/e2e.sh:1`.
- **2026-09-18** — Even the SAFE per-package check (`npm run typecheck`) cannot run here on a normal dev machine: `scripts/dev.sh` installs deps in server, client and reviewer-core only (`install_if_needed server`/`client` at :76-77, `npm ci` for reviewer-core at :80) and NEVER in e2e, so `e2e/node_modules` is simply absent and the script dies with "'tsc' is not recognized as an internal or external command", exit 1. The failure mode is the dangerous part: an automated per-package gate reads that non-zero exit as a TYPECHECK FAILURE (blocking/CRITICAL) when the truth is missing tooling — hit today by `/pr-self-review`, which routes e2e into `packages_touched` for a change to `e2e/INSIGHTS.md` alone, i.e. with no TypeScript in scope at all. Distinguish 'command could not run' from 'command failed' before blocking, and fix with `cd e2e && npm ci` (npm, not pnpm). Evidence: `scripts/dev.sh:76`, `e2e/package.json:5`.
- **2026-10-03** — agent-browser semantics that cost five fix passes on flow 09 (2026-10-03): (1) 'wait --url <string>' matches the END of the URL, not a substring — every passing flow names a URL suffix (/pulls/482, tab=findings); 'tab=diff' failed against ?tab=diff&file=...&line=45, and the README-style glob '**tab=diff&file=src%2F...&line=45' did not match either; 'line=45' (the real suffix) passed. (2) 'find ... click' does NOT scroll the app's scroll container: the studio scrolls <main> (overflow:auto), not the window, so a click on a below-the-fold element exits 0 and does nothing (failure screenshot showed the page top). 'scroll down 3000' alone also does nothing; 'scroll down 3000 --selector main' works. (3) 'find role button focus --name X --exact' exits non-zero (reason not printed: run.ts logs only the first error line), so a keyboard-Enter step could not replace the click. (4) The default action timeout is 25 s (AGENT_BROWSER_DEFAULT_TIMEOUT); a cold Next dev compile of /repos/[repoId]/onboarding took 40-57 s on Windows, so flow 08 fails on its wait --url and the half-finished compile also breaks the NEXT flow's first open. Evidence: e2e/specs/09-pr-brief.flow.json, e2e/test-results/09-pr-brief-fail.png.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
