# Insights index — mcp

GENERATED FILE — do not edit by hand, and do not add an insight here. Rebuild with
`node .claude/skills/engineering-insights/scripts/build-index.mjs` after every append.

Source: `mcp/INSIGHTS.md` — 7 entries, 3,523 bytes.

This index exists so you do not have to load the whole file to find out whether it
has anything to say about your task. Scan it, then read only the entries you need:

```bash
sed -n '120,124p' mcp/INSIGHTS.md
```

It is a finding aid, NOT a substitute for the entry — an insight's value is in its
detail, and the hook below is deliberately too short to act on. When the session
protocol says to read this package's insights, the source file is what it means.

## What Works

- `L9` · 2026-09-25 · esbuild resolves the tsconfig paths alias for @devdigest/shared and inlines it into dist/index.js at build time even with zod and…

## What Doesn't Work

- `L13` · 2026-09-25 · A dependency-cruiser rule with dependencyTypesNot: ['type-only'] exempts EVERY type-only import, not just the one it was written for. core-is-pure…

## Codebase Patterns

- `L17` · 2026-09-25 · The MCP SDK does NOT validate outputSchema when a tool result carries isError:true (sdk mcp.js:193) — an error result can skip structuredContent…

## Tool & Library Notes

- `L21` · 2026-09-25 · The measured tools/list size is 6876 bytes against the 8192-byte budget asserted by mcp/test/tools-list-budget.test.ts — recorded so a future…
- `L22` · 2026-09-25 · SDK 1.30.1 + zod 3.25.76 sends registerTool's generic inference into TS2589 (type instantiation excessively deep) even on a single-field schema,…
- `L23` · 2026-09-25 · pnpm refuses to run esbuild's install-time build script unless approved — mcp/pnpm-workspace.yaml sets allowBuilds: { esbuild: true }, the same gate…

## Recurring Errors & Fixes

- `L27` · 2026-09-25 · void extra.sendNotification(...) in a tool handler (mcp/src/tools/run-agent-on-pr.ts onProgress) is an unhandled rejection the moment the transport…
