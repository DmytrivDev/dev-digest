# Insights — e2e

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

## What Doesn't Work

- **2026-09-16** — A flow cannot assert a per-run COST or a severity breakdown today: the seed ships PRs, agents, a review and its findings, but NO priced `agent_runs`, so those UI surfaces render the em dash in a freshly-seeded stack. A flow that waits for a concrete `$0.0039` would fail on CI while passing on a developer machine that has real runs in its DB. Assert the column header and the "—" empty state instead, and only assert a value once the seed creates runs with `cost_usd`. Evidence: `server/src/db/seed.ts:225`, `e2e/docs/adding-a-flow.md:30`.

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
