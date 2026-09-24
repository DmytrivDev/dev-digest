# Insights index — reviewer-core

GENERATED FILE — do not edit by hand, and do not add an insight here. Rebuild with
`node .claude/skills/engineering-insights/scripts/build-index.mjs` after every append.

Source: `reviewer-core/INSIGHTS.md` — 2 entries, 1,479 bytes.

This index exists so you do not have to load the whole file to find out whether it
has anything to say about your task. Scan it, then read only the entries you need:

```bash
sed -n '120,124p' reviewer-core/INSIGHTS.md
```

It is a finding aid, NOT a substitute for the entry — an insight's value is in its
detail, and the hook below is deliberately too short to act on. When the session
protocol says to read this package's insights, the source file is what it means.

## Codebase Patterns

- `L13` · 2026-06-14 · reviewPullRequest already returns tokensIn/tokensOut/costUsd in ReviewOutcome — consumers wanting cost should READ it from the outcome, not recompute…

## Tool & Library Notes

- `L17` · 2026-09-15 · Although reviewer-core is consumed as SOURCE via tsconfig path aliases (never as a built/published module), it still needs its OWN node_modules: Node…
