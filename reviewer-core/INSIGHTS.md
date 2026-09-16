# Insights — reviewer-core

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-06-14** — `reviewPullRequest` already returns `tokensIn`/`tokensOut`/`costUsd` in `ReviewOutcome` — consumers wanting cost should READ it from the outcome, not recompute (zero extra model calls). Cost is accumulated per chunk and goes `null` if ANY chunk lacked a cost (conservative). The OpenRouter provider prefers the real `usage.cost` and falls back to `estimateCost`. Evidence: `reviewer-core/src/review/run.ts:110,184`, `src/llm/openrouter.ts`.

## Tool & Library Notes

- **2026-09-15** — Although reviewer-core is consumed as SOURCE via tsconfig path aliases (never as a built/published module), it still needs its OWN `node_modules`: Node resolves the bare `openai` / `zod` imports upward from `reviewer-core/src/`, so the consumer's deps (`server/node_modules`) are never visible. It is also the ONLY package installed with npm — it ships `package-lock.json`, not `pnpm-lock.yaml`, so use `npm ci` here while server/client use `pnpm install`. Evidence: `reviewer-core/src/llm/structured.ts:2`, `reviewer-core/package.json:8`, `reviewer-core/package-lock.json:1`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
