# Insights — mcp

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it. Append-only — see the
`engineering-insights` skill for how entries are captured.

## What Works

- **2026-09-25** — esbuild resolves the tsconfig paths alias for @devdigest/shared and inlines it into dist/index.js at build time even with zod and @modelcontextprotocol/sdk listed as explicit externals, confirmed by grepping dist/index.js for a value imported from the shared package (e.g. Severity) and confirming zod stays an external import line. The D4 fallback (type-only imports + narrow local schemas + plain tsc build) was not needed.

## What Doesn't Work

- **2026-09-25** — A dependency-cruiser rule with `dependencyTypesNot: ['type-only']` exempts EVERY type-only import, not just the one it was written for. core-is-pure used it so ring 1 could `import type` from @devdigest/shared, and that same exemption let core/mappers.ts type-import RunResultReviewFinding from ports/devdigest-api.ts (ring 2) with arch:check green — only the pr-self-review onion reviewer caught it. Fix was a companion rule core-no-outer-rings in mcp/.dependency-cruiser.cjs with NO dependencyTypes filter (core/** must not name ports|app|adapters|tools|server|index at all), and moving the type into core/results.ts. Any future carve-out: scope it with an explicit `to.path`, never a bare dependency-type exemption.

## Codebase Patterns

- **2026-09-25** — The MCP SDK does NOT validate outputSchema when a tool result carries isError:true (sdk mcp.js:193) — an error result can skip structuredContent entirely without tripping the SDK's own schema check, which is why every tools/*.ts error path only needs to satisfy the isError text contract, not outputSchema.

## Tool & Library Notes

- **2026-09-25** — The measured tools/list size is 6876 bytes against the 8192-byte budget asserted by mcp/test/tools-list-budget.test.ts — recorded so a future descriptions.ts edit knows the real headroom, not just the ceiling.
- **2026-09-25** — SDK 1.30.1 + zod 3.25.76 sends registerTool's generic inference into TS2589 (type instantiation excessively deep) even on a single-field schema, because it checks our concrete raw-shape schemas against a union spanning both zod v3 and v4 type surfaces. mcp/src/tools/register.ts casts only the SDK call's arguments to sidestep it; every caller stays fully typed through ToolConfig and the handler's own parameter type.
- **2026-09-25** — pnpm refuses to run esbuild's install-time build script unless approved — mcp/pnpm-workspace.yaml sets allowBuilds: { esbuild: true }, the same gate server/ already carries, or pnpm install silently leaves esbuild's native binary unbuilt and pnpm build fails later with an opaque error.

## Recurring Errors & Fixes

- **2026-09-25** — `void extra.sendNotification(...)` in a tool handler (mcp/src/tools/run-agent-on-pr.ts onProgress) is an unhandled rejection the moment the transport is closed mid-poll (client cancelled) — under Node's default --unhandled-rejections=throw that kills the whole stdio server. Every fire-and-forget SDK promise needs a .catch that logs via the injected ErrorLogger (stderr); regression test in test/tools.run-agent-on-pr.test.ts drives the handler through a fake McpServer with a rejecting sendNotification. Caught by DevDigest's own General Reviewer on PR #8, not by pr-self-review.

## Session Notes

## Open Questions
