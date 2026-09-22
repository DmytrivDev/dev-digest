# Insights index — e2e

GENERATED FILE — do not edit by hand, and do not add an insight here. Rebuild with
`node .claude/skills/engineering-insights/scripts/build-index.mjs` after every append.

Source: `e2e/INSIGHTS.md` — 3 entries, 2,765 bytes.

This index exists so you do not have to load the whole file to find out whether it
has anything to say about your task. Scan it, then read only the entries you need:

```bash
sed -n '120,124p' e2e/INSIGHTS.md
```

It is a finding aid, NOT a substitute for the entry — an insight's value is in its
detail, and the hook below is deliberately too short to act on. When the session
protocol says to read this package's insights, the source file is what it means.

## What Doesn't Work

- `L11` · 2026-09-16 · A flow cannot assert a per-run COST or a severity breakdown today: the seed ships PRs, agents, a review and its findings, but NO priced agent_runs,…

## Tool & Library Notes

- `L17` · 2026-09-18 · Do NOT follow CLAUDE.md's 'pnpm typecheck + pnpm test in the package you touched' literally here: e2e's test script is tsx run.ts — a LIVE browser…
- `L18` · 2026-09-18 · Even the SAFE per-package check (npm run typecheck) cannot run here on a normal dev machine: scripts/dev.sh installs deps in server, client and…
