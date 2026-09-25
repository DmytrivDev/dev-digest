# @devdigest/mcp

A local stdio MCP server that lets Claude Code call DevDigest from inside this repo.
It is a thin HTTP client of the running API (`http://localhost:3001`) — no DB access,
no import of server services. Transport is stdio only.

## Setup

```sh
cd mcp
pnpm install
pnpm build          # bundles src/ into dist/index.js with esbuild
```

The server is registered project-scoped in the repo root's `.mcp.json`
(`node mcp/dist/index.js`), so from Claude Code in this repo it shows up as `devdigest`
after you approve it once (`/mcp` to check).

It requires the running DevDigest stack: `./scripts/dev.sh` (Postgres + API :3001 +
web :3000, migrated + seeded). Every tool call talks to `http://localhost:3001`;
if the API is down, tools return an error naming `./scripts/dev.sh`.

## Tools

| Tool | What it does | Args |
|---|---|---|
| `list_agents` | Lists the configured PR reviewer agents (id, name, purpose, model, enabled) | — |
| `run_agent_on_pr` | Runs one agent on a PR and returns the verdict + top findings, waiting up to 2 minutes | `repo`, `pr`, `agent` |
| `get_findings` | Gets the verdict/findings (or running status) of a run by id | `run_id` |
| `get_conventions` | Gets the accepted coding conventions of an imported repo, plus triage counts | `repo` |
| `get_blast_radius` | Stub — not implemented yet (planned for the L04 homework); always returns an error | `repo`, `pr` |

Full description text and parameter docs: `mcp/src/tools/descriptions.ts` (D9 of
`docs/plans/devdigest-mcp.plan.md`).

## Env vars

| Var | Default | Notes |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | must be loopback (`localhost`/`127.0.0.1`/`::1`) — the server refuses anything else at boot |
| `DEVDIGEST_WEB_URL` | `http://localhost:3000` | used to build `url` fields in tool results |
| `DEVDIGEST_MCP_RUN_DEADLINE_MS` | `120000` | how long `run_agent_on_pr` polls before returning `status:"running"`; clamped to [5000, 170000] and must stay below the `.mcp.json` per-server `timeout` (180000) |

## Inspecting manually

```sh
cd mcp
pnpm inspect         # builds, then runs @modelcontextprotocol/inspector against dist/index.js
```

## Claude Code approval

The first time a session in this repo sees the `devdigest` project-scoped server in
`.mcp.json`, Claude Code prompts for approval before connecting. Approve it once per
machine; the approval is stored in your local Claude Code settings, not in the repo.
Check the connection any time with `/mcp`.

## Token budget

`tools/list` is measured at **6876 bytes**, against an 8192-byte budget
(`mcp/test/tools-list-budget.test.ts`). Every new chat in this repo pays that cost
once at session start, which is why descriptions are one or two sentences with no
examples (D6 of the plan).

## Commands

`pnpm build` · `pnpm dev` (tsx, unbundled) · `pnpm typecheck` · `pnpm test` ·
`pnpm arch:check` (dependency-cruiser, onion rings — see `mcp/CLAUDE.md`) · `pnpm inspect`
