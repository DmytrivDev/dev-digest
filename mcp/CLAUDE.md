# mcp (@devdigest/mcp)

Local stdio MCP server: five tools that let Claude Code drive DevDigest from inside
this repo (`list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`,
`get_blast_radius`).

## Iron rule
Thin HTTP client only — no DB access, no import of server services. The only I/O is
`fetch` against the running API (`http://localhost:3001`). stdout is sacred: nothing
but the SDK transport writes to it; every diagnostic goes to `process.stderr`
(`src/adapters/log.ts`).

## Stack
`@modelcontextprotocol/sdk@1.30.1` (stdio transport) · zod `^3.25.76` (pinned to match
`server`/`client`/`reviewer-core`) · TypeScript ESM, bundled with esbuild — `tsc` never
emits JS here, `pnpm build` runs `scripts/build.mjs`.

## Commands
`pnpm build` · `pnpm dev` (tsx, unbundled — dev only) · `pnpm typecheck` · `pnpm test`
(vitest) · `pnpm arch:check` (dependency-cruiser, onion rings) · `pnpm inspect`
(builds, then runs `@modelcontextprotocol/inspector` against `dist/index.js`)

## Conventions (not obvious from code)
- Ring layout under `src/`: `core/` (pure, no I/O) → `ports/` (interfaces:
  `DevDigestApi`, `Clock`) → `app/` (use cases: resolve, run-review, queries) →
  `adapters/` (fetch, env, stderr log) and `tools/` (MCP-facing, driving). See
  `.claude/skills/onion-architecture/mcp.md` for the full ring table and the six
  `arch:check` rules.
- `@devdigest/shared` is consumed by a **tsconfig path alias** to the server's vendored
  copy (`../server/src/vendor/shared/index.ts`), never a third hand-maintained copy —
  same pattern as `reviewer-core/tsconfig.json`. `esbuild` inlines it at build time;
  `zod` and the SDK stay external so exactly one `zod` instance exists at runtime.
- Shared schemas are used ONLY to `safeParse` API responses in `adapters/http-client.ts`.
  Tool `inputSchema`/`outputSchema` are written with mcp's own `z` in each `tools/*.ts` —
  a shared schema must never be passed to `registerTool`.
- `app/run-review.ts` (the D3 orchestration for `run_agent_on_pr`) takes progress and
  cancellation as a plain `onProgress` callback + `AbortSignal`, never the SDK's `extra` —
  that keeps ring 3 free of an SDK import and testable with a fake `Clock` + fake API.
- Errors are always tool results (`{isError:true, content:[...]}`), never protocol
  errors, and never carry a stack trace or an API response body — see `core/errors.ts`.

## Gotchas & do-not-touch
- `src/index.ts` is the only file allowed to touch `StdioServerTransport`; tests import
  `src/server.ts` instead, sidestepping the `import.meta.url` vs `argv[1]` trap.
- `registerTool`'s generics hit `TS2589` against this SDK+zod combination —
  `src/tools/register.ts` is a thin wrapper that casts only the one SDK call; every
  caller of it stays fully typed.
- Never widen `mcp/src/tools/*.ts` to import `adapters/**` directly — go through the
  `app/*` function the tool is supposed to call (`arch:check` rule
  `tools-no-driven-adapters`).
- `mcp/pnpm-workspace.yaml` sets `allowBuilds: { esbuild: true }` — same pnpm
  build-script approval gate as `server/`.

## Use when
- Tool list, env vars, setup, Claude Code approval → `mcp/README.md`
- Ring map, enforcement rules → `.claude/skills/onion-architecture/mcp.md`
- Plan this package was built from → `docs/plans/devdigest-mcp.plan.md`
- Findings from past sessions → `mcp/INSIGHTS.md`
