# Onion rings inside `mcp/` (@devdigest/mcp)

`SKILL.md` is scoped to `@devdigest/api` and `@devdigest/reviewer-core` — it predates
`mcp/`. This file is the ring map for `mcp/` specifically, written down so a reviewer
routed here judges the package by its own layout instead of the server's paths
(`server/src/modules/...`, `platform/...`) which do not exist in `mcp/`.

Source: `docs/plans/devdigest-mcp.plan.md`, design section D8 ("Onion rings inside
`mcp/`"), which is the actual, implemented layout — not a superseded draft.

## The rule, unchanged

> A file may import from its own ring and from rings closer to the core. Never outward.

Same rule as `SKILL.md` §"The rule". Only the ring→folder map differs, because `mcp/`
is a single small package rather than a server with many modules.

## The four rings, as implemented

| # | Ring | `mcp/src/` path | Contents | May import |
|---|---|---|---|---|
| 1 | Core — pure, no I/O, no clock | `core/results.ts` | output Zod schemas (`AgentList`, `FindingsResult`, `ConventionsResult`) + inferred types | `zod` |
| 1 | | `core/mappers.ts` | sort / cap / clip / `toText` | `core/*`, `zod`, **type-only** `@devdigest/shared` |
| 1 | | `core/errors.ts` | `ToolError(kind, text)` + onward-text builders | `core/*` |
| 1 | | `core/limits.ts` | `MAX_FINDINGS`, clip lengths, `UNTRUSTED_PREFIX` | — |
| 2 | Ports — the conversation, not the tech | `ports/devdigest-api.ts` | `DevDigestApi` interface | `core/*`, type-only `@devdigest/shared` |
| 2 | | `ports/clock.ts` | `Clock { now(): number; sleep(ms, signal): Promise<void> }` | — |
| 3 | Application — use cases | `app/resolve.ts` | `owner/name` → repo, `#N` → PR | rings 1–2 |
| 3 | | `app/run-review.ts` | resolve → hydrate → validate agent → reuse-or-start → wait → map, as a plain function taking `onProgress` + `AbortSignal` | rings 1–2 |
| 3 | | `app/queries.ts` | `listAgents`, `getRunFindings`, `getConventions` | rings 1–2 |
| 4 | Driven adapters | `adapters/http-client.ts` | `fetch` implementation of `DevDigestApi`; `safeParse`s every response with the shared schemas | rings 1–2, `@devdigest/shared` values |
| 4 | | `adapters/system-clock.ts`, `adapters/config.ts`, `adapters/log.ts` | `Date.now`/`setTimeout`, `process.env`, stderr | rings 1–2 |
| 4 | Driving adapters (≈ routes) | `tools/<tool>.ts` ×5 | input schema, annotations, call ONE app function, map `ToolError` → `isError` result | rings 1–3, `@modelcontextprotocol/sdk` |
| 4 | | `tools/register.ts` | thin wrapper around `McpServer#registerTool` (see "SDK generics" below) | rings 1–3, SDK types |
| 4 | | `tools/descriptions.ts` | the five tool descriptions + param descriptions | — |
| 4 | | `tools/result.ts` | `toToolResult` / `toErrorResult` (MCP envelope) | ring 1, SDK types |
| — | Composition root | `server.ts` | `createServer(deps)` — builds adapters, injects ports into app functions, registers tools | everything |
| — | Entry | `index.ts` | config → `createServer` → `StdioServerTransport` | `server.ts`, `adapters/*` |

## The six enforcement rules

Enforced by `mcp/.dependency-cruiser.cjs` + `pnpm arch:check` (run from `mcp/`), all at
severity `error` — there is no legacy debt to baseline in a brand-new package:

1. **`core-is-pure`** — `core/**` may depend only on itself and `zod`, plus TYPE-ONLY
   imports from `@devdigest/shared`. No node builtins, no SDK, no adapters/ports/app/tools.
   Companion rule **`core-no-outer-rings`** closes the gap `core-is-pure`'s type-only
   exemption opens: `core/**` must not name `ports/app/adapters/tools/server/index` even
   type-only. A type ring 1 needs is defined in ring 1 (e.g. `RunResultReviewFinding` in
   `core/results.ts`), and `ports/` imports it from there.
2. **`ports-are-types`** — `ports/**` may depend only on `core/**` and type-only imports
   (including `@devdigest/shared`) — never a concrete adapter, the SDK, or a value import
   from outside `core/**`.
3. **`app-no-outward`** — `app/**` must not import `adapters/**`, `tools/**`, `server.ts`,
   `@modelcontextprotocol/sdk`, or any `node:*` builtin. This is what keeps
   `app/run-review.ts` testable with `test/fake-api.ts` + a fake `Clock`, and reusable
   outside an MCP server.
4. **`tools-no-driven-adapters`** — `tools/**` must not import `adapters/**` directly; a
   tool calls the one `app/*` function that does the work (transport.md's "thin
   controller").
5. **`only-root-wires`**, split into two concrete rules:
   - `only-root-wires-server` — only `index.ts` may import `server.ts`.
   - `only-root-wires-adapters` — nothing but `server.ts`/`index.ts` may CONSTRUCT a
     driven adapter (a VALUE import of `adapters/**`). **Narrowed from D8's original
     wording** to `dependencyTypesNot: ['type-only']`: a file naming an adapter's
     exported TYPE (e.g. `http-client.ts` referencing `Config`'s shape) constructs
     nothing and is not what this rule guards against. Only a value import — actually
     building the thing — trips it.
6. **`no-server-src`** — nothing under `mcp/src` may import `server/src/**`, except
   through the `@devdigest/shared` alias to the vendored copy (`server/src/vendor/shared/`).
   This is the "thin client, no services" half of the package's own goal statement, made
   structural.

## Deviations from `SKILL.md`, each justified in D8

- **The port lives in `mcp/src/ports/`, not in `@devdigest/shared`.** `SKILL.md` §2 says a
  port belongs in the shared package. This one deliberately does not: only `mcp` consumes
  `DevDigestApi`, and adding it to `@devdigest/shared` would mean editing both vendored
  copies (`server/src/vendor/shared/`, `client/src/vendor/shared/`) for a port neither the
  server nor the client ever uses — exactly the cost §2 warns against. It is still a
  justified port by §2's own test: it crosses a process boundary (HTTP to the API) AND a
  test substitutes it (`mcp/test/fake-api.ts`). Method names describe the conversation
  (`startReview`, `runResult`), never an HTTP verb or path.
- **Ring 1 may `import type` from `@devdigest/shared`.** `core/mappers.ts` translates API
  DTOs into tool results and must name the DTO types to do so. Type-only imports are erased
  by esbuild at bundle time, so ring 1 carries no runtime dependency on the shared package —
  value imports stay forbidden there (rule 1).
- **`Clock` is a port**, not a pair of loose `now`/`sleep` parameters, because the
  `run_agent_on_pr` deadline-wait tests (`mcp/test/tools.run-agent-on-pr.test.ts`) must
  substitute it wholesale — the same §2 "a test must substitute it" justification as
  `DevDigestApi`.

## SDK generics — a build-time finding, not a ring violation

`registerTool` on `@modelcontextprotocol/sdk@1.30.1` infers its generics against a union
type that spans both zod v3 and v4 type surfaces, which drives `tsc` into `TS2589: Type
instantiation is excessively deep and possibly infinite` even on a single-field schema.
`tools/register.ts` casts only that one SDK call's arguments; every caller stays fully
typed through `ToolConfig` and the handler's own parameter type. This is a TypeScript
workaround, not an onion-rule exception — `register.ts` still only imports SDK types and
ring 1–3 code, same as every other file in `tools/`.
