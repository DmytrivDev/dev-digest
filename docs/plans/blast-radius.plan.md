# Plan: Blast Radius (L04 homework)

**Goal** — The PR detail page's Overview tab has a **Blast Radius** card. It shows:
- the symbols declared in the PR's changed files;
- for each symbol, who calls it (`file:line`, linking to the exact GitHub line);
- the HTTP endpoints and crons that depend on those callers;
- a clear empty state, or a degraded badge with its reason and a Resync button.

It also offers a Tree/Graph toggle and a lazy "Prior PRs touching these files" panel. The MCP tool `get_blast_radius` returns the same map. Everything is read from the repo-intel index: no re-parse on the hot path and no LLM call.

**In scope**
- Contract: optional fields on `BlastRadius`, `BlastCaller` and `PrHistory`, in both vendored copies.
- Fixes to the repo-intel facade: callers capped per symbol, honest `degraded`/`reason`, and the declaring file removed from its own callers.
- A new server module `blast` with `GET /pulls/:id/blast` and `GET /pulls/:id/history`.
- One new `GitHubClient` port method for PR history, with the Octokit and mock adapters.
- Client: a `BlastRadiusCard` with summary, tree, graph, history, empty state, degraded badge and Resync. New hooks in `lib/hooks/blast.ts`. Strings in `messages/en/blast.json`.
- MCP: a real `get_blast_radius` tool, a new port method, the HTTP adapter, the fake and tests. The D9 description is updated in lock-step.

**Out of scope**
- Changing what the indexer extracts (`pipeline/**`), or re-indexing on PR open.
- Paginating `pulls.listFiles` beyond 100 files. `OctokitGitHubClient.getPullRequest` already truncates there (`server/src/adapters/github/octokit.ts:79-84`). This is pre-existing and recorded under Assumptions.
- Migrating the known onion debt in `repo-intel/service.ts` (it takes the whole `Container` and imports concrete adapters, per onion-architecture §5). W2 touches that file but must not ADD to the debt.
- `server/specs`, `client/specs` and `docs/` write-ups. `doc-writer` owns those. The one exception is the D9 table in `docs/plans/devdigest-mcp.plan.md`: `mcp/test/tools-list-budget.test.ts` is frozen against it, so it must change together with the code (W6).
- Architecture review and security review. Separate agents perform them; they are not this plan's concern.

**Branch.** Work continues on the current branch `feat/l04-devdigest-mcp`, which is the L04 homework branch, as the caller stated. Do not create or switch branches. Read `docs/git-workflow.md` before any commit (root `CLAUDE.md`).

---

## Key decisions (read before starting)

1. **Own module `server/src/modules/blast/`, plus one line in `server/src/modules/index.ts`.**
   - `modules/index.ts:25` already names `blast` as a lesson module.
   - Registration is static (`modules/index.ts:19-22`).
   - The service takes **ports and a repository, never `Container`**. Copying the Container shape took `arch:check` from 20 to 21 once already (`server/INSIGHTS.md:40`).
   - Composition happens in `blast/routes.ts`. That file is ring 4, so it may read `app.container`, the same as `modules/intent/routes.ts:36-45`.
2. **The mapping from `BlastResult` to `BlastRadius` is a pure function in `blast/helpers.ts`.** `arch:check`'s ring-1 guard `core-not-to-io` matches files by NAME only (`^src/modules/[^/]+/(cost|status|findings|helpers)\.ts$`, `server/.dependency-cruiser.cjs:23`; `server/INSIGHTS.md:48`). The new facade helpers go in a new `repo-intel/helpers.ts` for the same reason.
3. **When `pr_files` is empty, fall back to GitHub and do not persist.**
   - `pr_files` is written only by `GET /pulls/:id` (`server/INSIGHTS.md:49`; `modules/pulls/routes.ts:234-275`). An MCP caller can hit `/blast` for a PR nobody has opened.
   - The blast service reads `pr_files` first. If that returns zero rows, it calls `github.getPullRequest(ref, number)` ONCE and uses `detail.files[].path`.
   - It does **not** write `pr_files`. That table's delete-then-insert transaction is owned by `pulls/routes.ts`. A second writer in another module would duplicate the transaction and split ownership.
   - If GitHub is unavailable (`ConfigError` when there is no token, or any other throw), the response is a valid empty `BlastRadius` with `degraded: true, reason: 'files_unavailable'`. It is not a 5xx. The client and MCP render that reason with an onward action: "open the PR in DevDigest" / "configure a GitHub token".
   - Rejected alternative: MCP calls `GET /pulls/:id` first, the way `run-review` hydrates. The server would still be wrong for every other direct caller (scripts, tests), and the gotcha is a server-side one.
4. **The facade is called exactly ONCE per request.** `repoIntel.getBlastRadius(pull.repoId, changedFiles)` runs with `repoId` taken from the workspace-scoped pull row. The facade itself is tenant-agnostic (`repo-intel/routes.ts:42-45` checks the workspace before calling it). The blast module never takes a `repoId` from the request.
5. **Grouping rules** (all in `blast/helpers.ts`, all deterministic):
   - Callers are grouped by `viaSymbol` into `downstream[]`. Symbols with zero callers do not get a group. They still count in `changed_symbols`.
   - A group's `endpoints_affected`/`crons_affected` is the de-duplicated union of `factsByFile[caller.file]` over that group's caller files, sorted.
   - Each caller also carries its own `endpoints`/`crons` (new optional contract fields). The graph needs them to draw honest caller→endpoint edges. The mock draws those edges arbitrarily (`blast.jsx`, `callerNodes.slice(0, 2)`).
   - Groups are sorted by max caller `rank` desc, then caller count desc, then symbol name asc. Callers inside a group are sorted by rank desc, then file asc, then line asc. On the ripgrep path every rank is 0, so the tie-breakers decide the order.
   - **A symbol's declaring file never appears among that symbol's callers.** A caller that lives in a DIFFERENT changed file is kept. That is how PR #8 gets its endpoint: `reviews/routes.ts` is itself changed, and it calls symbols declared in `reviews/service.ts`. The design mock contradicts this rule (`data.jsx` BLAST lists `rateLimit` at `src/middleware/ratelimit.ts:41` as a caller of `bucketKey`, which is declared in that same file). The caller's rule wins.
   - The per-symbol cap is applied in the FACADE (W2), from `MAX_CALLERS_PER_SYMBOL` (`repo-intel/constants.ts:37`). The blast helper does not re-cap and hardcodes no limit.
   - `summary` is a deterministic English count string, e.g. `3 symbols changed → 7 callers, 2 endpoints, 0 crons`. It uses the same shape as the mock's `data.jsx` BLAST `summary`.
   - `counts` (a new optional contract field) carries the four numbers. The client stats row and the MCP tool then read one source instead of each re-deriving it. The counts are:
     - `symbols` = `changed_symbols.length`
     - `callers` = the sum of `downstream[].callers.length`
     - `endpoints` = the unique endpoints across `downstream`
     - `crons` = the unique crons across `downstream`
6. **GitHub caller links use the index SHA.**
   - Caller lines come from the index at `repo_index_state.last_indexed_sha`, which is the synced default-branch commit. Linking at the PR head drifts whenever a caller file is itself changed in the PR, and on PR #8 `reviews/routes.ts` is.
   - So the contract gets optional `indexed_sha`, and the client builds `githubBlobUrl(repoFullName, indexed_sha ?? headSha, file, line)` (`client/src/lib/github-urls.ts:24`).
   - The caller asked for `headSha`. This choice is the one deviation, made because the acceptance line is "click → exact GitHub line". See Open questions Q1 for a one-word override.
7. **The facade's `reason` means "why the index was not fully used", never "no results".**
   - The persistent path returns `degraded: false` on a `full` index. On a `partial` index it returns `degraded: true, reason: 'index_partial'`, and the data is still returned.
   - The ripgrep fallback is always `degraded: true`. Its `reason` is:
     - `flag_off` when `repoIntelEnabled` is false;
     - otherwise the index state's own `degradedReason`;
     - otherwise `index_failed` when the status is `failed`;
     - otherwise `no_data`, meaning no usable index exists.
   - This replaces the current behaviour, which tags `no_data` unconditionally (`repo-intel/service.ts:243,312`).
8. **Prior PRs come through a new GitHub port method, lazily, with no server cache.**
   - GitHub search cannot filter PRs by changed path, so the only route is two steps: commits by path, then the PRs associated with each commit (researcher, see Research used).
   - The server makes at most `MAX_HISTORY_PATHS` (5) × (1 + `MAX_COMMITS_PER_PATH` (5)) = 30 REST calls per request. The authenticated limit is 5,000/h.
   - The client mounts the list, and so fires the query, only when the collapsible opens. That is the child-mount trick from `client/INSIGHTS.md:11`. The query uses `staleTime: 5 min`.
   - The route is rate-limited to 10 requests/min, using the same `config.rateLimit` shape as `intent/routes.ts:60-63`.
   - `notes` is a deterministic sentence built from dates and the overlap count. There is no LLM.
   - No GitHub token gives `{ history: [], reason: 'no_github' }` with a 200. Other GitHub failures give `reason: 'github_error'`, with any partial results kept.
9. **No client value import from `@devdigest/shared`.** Everything the client needs is `import type`. `pnpm build` still runs once as a guard (`client/INSIGHTS.md:22`), with the dev server stopped (`client/INSIGHTS.md:41`).
10. **The new MCP output schema must stay flat and small.** `tools/list` measures 6876 of 8192 bytes (`mcp/INSIGHTS.md:21`), so an output schema, plus the longer description, has roughly 1.3 KB of headroom. Callers become strings (`"file:line name"`), not objects. The budget test is the arbiter.

---

## Affected surface

Skills come from `.claude/skills/pr-self-review/routing.json`. "security*" means `security` is path-routed there, or content-triggered on `token`/`process.env`.

| File | New/Mod | Package | Ring / home | Skills that will govern it | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts` | Mod | api | Ports (ring 2) | zod | Byte-identical with the client copy, comments included (`server/INSIGHTS.md:38,57`). New enums must be declared ABOVE the schema that uses them, or you get a TDZ crash at import time (`server/INSIGHTS.md:44`). |
| `client/src/vendor/shared/contracts/brief.ts` | Mod | web | Ports (vendored copy) | zod | Same bytes (`client/src/test/vendor-shared-sync.test.ts`). |
| `server/src/vendor/shared/adapters.ts` | Mod | api | Ports (ring 2) | zod (content trigger `z.`? no — plain TS; routed by glob `server/src/vendor/shared/**`) | New `GitHubClient` method + `PathPullRequest` interface; the port names no Octokit type (onion §2 "Naming and shape"). |
| `client/src/vendor/shared/adapters.ts` | Mod | web | Ports (vendored copy) | zod | Same bytes. |
| `server/test/contracts.test.ts` | Mod | api | test | — (unrouted) | Extend the fixture at `:73-88`; `server/INSIGHTS.md:73`. |
| `server/src/modules/repo-intel/types.ts` | Mod | api | Ports (ring 2) | onion-architecture, typescript-expert (if `Record<`/`Pick<` added) | Optional fields only: `BlastResult.indexStatus?`, `indexedSha?`; `BlastCallerRow.declFile`. |
| `server/src/modules/repo-intel/helpers.ts` | New | api | Core (ring 1) | onion-architecture | Pure; filename keeps it under `core-not-to-io` (`.dependency-cruiser.cjs:23,43`). |
| `server/src/modules/repo-intel/repository.ts` | Mod | api | Application (ring 3) | onion-architecture, drizzle-orm-patterns | `getResolvedCallers` also selects `declFile` (`repository.ts:514-542`); return type stays module-local (ban 3). |
| `server/src/modules/repo-intel/service.ts` | Mod | api | Application (ring 3) — known debt | onion-architecture, security | No NEW import of `adapters/**` or container use beyond what exists (`service.ts:20-29`); routing suppress note for §5 debt. |
| `server/test/repo-intel-blast.test.ts` | New | api | test (no DB) | — (unrouted) | Patch `svc.repo` like `repo-intel-facade-degraded.test.ts:34-40`. |
| `server/test/repo-intel-facade-degraded.test.ts` | Mod | api | test | — | Tighten `:54-65` to `reason === 'flag_off'`. |
| `server/src/modules/blast/constants.ts` | New | api | Core data (ring 1) | onion-architecture | History limits only; caller cap is NOT redefined here. |
| `server/src/modules/blast/helpers.ts` | New | api | Core (ring 1) | onion-architecture | Pure; type-only imports of `@devdigest/shared` and `../repo-intel/types.js` (precedent `smart-diff/helpers.ts:1`). |
| `server/src/modules/blast/repository.ts` | New | api | Application (ring 3) | onion-architecture, drizzle-orm-patterns | Every read workspace-scoped; returns a projection, not `$inferSelect` (ban 3); `ORDER BY path` (`smart-diff/repository.ts:24-39`, `server/INSIGHTS.md:23`). |
| `server/src/modules/blast/service.ts` | New | api | Application (ring 3) | onion-architecture, security | Constructor takes `{repo, repoIntel, github}` — no `Container` (`server/INSIGHTS.md:40`); `RepoIntel` type from `../repo-intel/types.js` (precedent `conventions/service.ts:26`). |
| `server/src/modules/blast/routes.ts` | New | api | Adapter (ring 4) | onion-architecture, fastify-best-practices, security | Zod `params`/`response` schemas, no `.parse` in handler (`server/CLAUDE.md`); no drizzle import (ban 1). |
| `server/src/modules/index.ts` | Mod | api | Composition | onion-architecture | One import + one entry (`index.ts:19-22`). |
| `server/test/blast-helpers.test.ts` | New | api | test | — | No DB. |
| `server/test/blast-service.test.ts` | New | api | test | — | Fakes for repo/repoIntel/github; no DB. |
| `server/test/blast.it.test.ts` | New | api | test (DB) | — | MUST be `*.it.test.ts` (`server/CLAUDE.md`); copy `smart-diff.it.test.ts` setup. |
| `server/src/adapters/github/octokit.ts` | Mod | api | Adapter (ring 4) | onion-architecture, security | `withRetry(withTimeout(…))` wrapper like `octokit.ts:70-124`. |
| `server/src/adapters/mocks.ts` | Mod | api | Adapter (ring 4) | onion-architecture, security | `MockGitHubOptions.pathPulls`; use `sk_live_xxx`-style placeholders only (`server/INSIGHTS.md:80`). |
| `server/test/intent.it.test.ts` | Mod | api | test | — | Hand-rolled `GitHubClient` at `:182-199` must gain the new method (it is typed as the interface). |
| `server/test/adapters.test.ts` | Mod | api | test | — | Only if it enumerates `MockGitHubClient` methods — check. |
| `client/src/lib/hooks/blast.ts` | New | web | hook | frontend-ui-architecture, react-best-practices | Data only through `lib/api.ts`; never copy query data into state (frontend-ui §5). |
| `client/src/lib/hooks/blast.test.ts` | New | web | test | react-testing-library | Pattern: `client/src/lib/hooks/reviews.test.ts`. |
| `client/messages/en/blast.json` | Mod | web | i18n | frontend-ui-architecture | Missing key renders raw key silently (`client/INSIGHTS.md:32`). Keep existing keys. |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Mod | web | route page | next-best-practices, frontend-ui-architecture, react-best-practices | Only passes `repoId`, `repoFullName`, `headSha` to `OverviewTab` (`page.tsx:143`); do not change the rendering model (frontend-ui §6 honest note). |
| `.../_components/OverviewTab/OverviewTab.tsx` | Mod | web | route-local | frontend-ui-architecture, react-best-practices, next-best-practices (`"use client"`) | Compose only; render `BlastRadiusCard` after `IntentCard`. |
| `.../_components/BlastRadiusCard/{BlastRadiusCard.tsx,index.ts,styles.ts,constants.ts,helpers.ts}` | New | web | route-local `_components/` | frontend-ui-architecture, react-best-practices | styles.ts `s` object, CSS vars, no Tailwind, no shorthand+longhand mix (`client/INSIGHTS.md:33`; frontend-ui §7). |
| `.../BlastRadiusCard/BlastRadiusCard.test.tsx`, `helpers.test.ts` | New | web | test | react-testing-library | `fireEvent`, no user-event (`client/INSIGHTS.md:47`); pattern `IntentCard.test.tsx:1-30`. |
| `.../BlastRadiusCard/_components/BlastSummary/` | New | web | child of card | frontend-ui-architecture, react-best-practices | — |
| `.../BlastRadiusCard/_components/BlastTree/` | New | web | child of card | frontend-ui-architecture, react-best-practices | Callers via `MonoLink href` (`vendor/ui/primitives/MonoLink.tsx` opens `_blank` + `noopener`). |
| `.../BlastRadiusCard/_components/BlastGraph/` | New | web | child of card | frontend-ui-architecture, react-best-practices | Pure layout in the card's `helpers.ts`; SVG text via React children (no `dangerouslySetInnerHTML` — security content trigger). |
| `.../BlastRadiusCard/_components/PriorPrs/` | New | web | child of card | frontend-ui-architecture, react-best-practices | List child mounts only when open (`client/INSIGHTS.md:11`). |
| `mcp/src/core/results.ts` | Mod | mcp | Core (ring 1) | onion-architecture, security | mcp's own `z`; never pass a shared schema to `registerTool` (`mcp/CLAUDE.md`). |
| `mcp/src/core/limits.ts` | Mod | mcp | Core (ring 1) | onion-architecture, security | Display caps for the tool output. |
| `mcp/src/core/mappers.ts` | Mod | mcp | Core (ring 1) | onion-architecture, security | Type-only `@devdigest/shared`; never import ports/app (`mcp/INSIGHTS.md:13`). |
| `mcp/src/ports/devdigest-api.ts` | Mod | mcp | Ports (ring 2) | onion-architecture, security | Method named for WHAT, not the path (`devdigest-api.ts:1-9`). |
| `mcp/src/adapters/http-client.ts` | Mod | mcp | Driven adapter (ring 4) | onion-architecture, security | `safeParse` with shared `BlastRadius`/`PrHistory`; `syncFetchTimeoutMs` (the route may call GitHub). |
| `mcp/src/app/queries.ts` | Mod | mcp | Application (ring 3) | onion-architecture, security | No SDK / node import (`mcp.md` rule 3). |
| `mcp/src/tools/get-blast-radius.ts` | Mod | mcp | Driving adapter (ring 4) | onion-architecture, security | Call ONE app function; no `adapters/**` import (`mcp.md` rule 4). |
| `mcp/src/tools/descriptions.ts` | Mod | mcp | Driving adapter (ring 4) | onion-architecture, security | Verbatim copy of the D9 table (`descriptions.ts:1-7`). |
| `mcp/src/server.ts` | Mod | mcp | Composition root | onion-architecture, security | `registerGetBlastRadius(server, {api, webUrl, log})` (`server.ts:34`). |
| `mcp/test/fake-api.ts`, `mcp/test/tools.get-blast-radius.test.ts`, `mcp/test/mappers.test.ts` | Mod | mcp | test | — (excluded `mcp/**/*.test.ts`; fake-api is a plain `.ts` under `test/`, unrouted) | — |
| `docs/plans/devdigest-mcp.plan.md` | Mod | docs | — | — (unrouted) | D5 row (`:164`) + D9 row (`:321`) updated first, verbatim. |
| `mcp/README.md` | Mod | docs | — | — (unrouted) | Tool table row `:31`. |

**Coverage gaps.** No domain reviewer looks at these files, which are unrouted by design:
- `server/test/*.ts` (routing excludes only `server/src/**/*.test.ts`, so `server/test/` matches no glob)
- `mcp/test/*.ts`
- `docs/plans/devdigest-mcp.plan.md`
- `mcp/README.md`
- this plan

`plan-verifier` checks them against this plan. Nothing else does.

---

## Contract changes

- **vendor/shared: yes.**
  - `contracts/brief.ts`, in both copies. The edits stay inside the existing `---- Blast radius ----` and `---- PR History ----` sections. Every new `const` is declared ABOVE the first schema that references it:
    - `BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data','files_unavailable'])`
    - `BlastIndexStatus = z.enum(['full','partial','degraded','failed'])`. It is named `Blast…` so it does not collide with the `IndexStatus` export at `contracts/platform.ts:263`.
    - `BlastCounts = z.object({ symbols, callers, endpoints, crons: z.number().int().nonnegative() })`
    - `BlastCaller` gains `endpoints: z.array(z.string()).optional()` and `crons: z.array(z.string()).optional()`.
    - `BlastRadius` gains `degraded: z.boolean().optional()`, `reason: BlastDegradedReason.optional()`, `index_status: BlastIndexStatus.optional()`, `indexed_sha: z.string().optional()` and `counts: BlastCounts.optional()`.
    - `PrHistoryUnavailableReason = z.enum(['no_github','github_error'])`. `PrHistory` gains `reason: PrHistoryUnavailableReason.optional()`.
    - Every addition is optional, so `PrBrief` (`brief.ts:158-163`) and the existing fixtures still parse. That backward compatibility is the justification the zod rule `schema-avoid-optional-abuse` asks for. Write it in a one-line comment above the fields, in both copies.
  - `adapters.ts`, in both copies:
    - a `PathPullRequest { number; title; author; merged_at }` interface;
    - `GitHubClient.listMergedPullsForPath(repo, path, opts: { maxCommits: number }): Promise<PathPullRequest[]>`, with a doc comment stating the call count (1 + ≤ maxCommits).
  - Both copies are byte-identical. Check with `server/test/vendor-shared-sync.test.ts` and `client/src/test/vendor-shared-sync.test.ts`.
- **Migration: no.** Every table read already exists: `pr_files`, `pull_requests`, `repos`, `references`, `file_rank`, `file_facts`, `repo_index_state` (`db/schema/repo-intel.ts:6-7,52,72`).
- **Seed: no.** Blast reads the repo-intel index, which is built by clone+index, not by `seed.ts`. The seeded demo repo (`acme/payments-api`) does not exist on GitHub (`server/INSIGHTS.md:17`), so it has no clone and no index. On a clean checkout its card therefore shows the **degraded `no_data` state with a Resync button**. That state is itself a delivered, visible piece of the feature. Real data appears for any imported repo after its index job finishes. W11 verifies this on `DmytrivDev/dev-digest`.
- **Client build check needed: no new value import is planned.** All client imports of `@devdigest/shared` are `import type`. `pnpm build` still runs once at the end of W5 as a guard (`client/INSIGHTS.md:22`). If any client file gains a value import, the build is mandatory for that item.
- **i18n: yes.** Extend `client/messages/en/blast.json`, keeping the existing keys `stat.*`, `view.*`, `callerCount`, `noDownstream`, `graph.*`. Add:
  - `title`
  - `loading`, `error`, `retry`
  - `noSymbols`
  - `callerCount`, rewritten as ICU plural `{count, plural, one {# caller} other {# callers}}`
  - `endpointsLabel`, `cronsLabel`
  - `degraded.badge`
  - `degraded.reason.{flag_off,index_failed,index_partial,repo_too_large,no_data,files_unavailable}`
  - `resync`, `resyncing`, `resyncDone`
  - `graph.legend.{symbol,callers,endpoints,crons}`, `graph.more`, `graph.symbolPicker`
  - `history.{title,empty,noGithub,githubError,loading,mergedBy}`

---

## Work items

Each item leaves `server`, `client` and `mcp` typechecking. Order: contract, then facade, then blast module, then client core, then MCP, then extras.

### W1 — Contract: optional Blast/History fields in both vendored copies
- **Do:**
  - Add the enums and fields listed under Contract changes to `server/src/vendor/shared/contracts/brief.ts`, then copy the file byte-for-byte to the client.
  - Extend `server/test/contracts.test.ts:68-88`. One `BlastRadius.parse` must carry every new field. One `BlastRadius.parse` of the OLD shape (no new fields) must still pass. Add one `BlastRadius.safeParse` with `reason: 'bogus'` that fails. Add a `PrHistory.parse` with `reason: 'no_github'`.
- **Files:** both `contracts/brief.ts`, `server/test/contracts.test.ts`.
- **Done means:**
  - `git diff --no-index server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
  - Both sync tests pass.
  - `contracts.test.ts` passes with the three new assertions.
  - Importing the barrel does not throw (no TDZ). The contracts test importing `@devdigest/shared` proves it.
- **Verify:**
  - In `server/`: `pnpm typecheck`, then `pnpm exec vitest run test/contracts.test.ts test/vendor-shared-sync.test.ts`.
  - In `client/`: `pnpm typecheck`, then `pnpm exec vitest run src/test/vendor-shared-sync.test.ts`.
- **Rules that apply:**
  - zod → `schema-use-enums`, `object-optional-vs-nullable` (optional, not nullable, because an absent field means "server predates it"), `type-export-schemas-and-types` (every new schema exports a same-named type, as root `CLAUDE.md` Naming requires).
  - onion-architecture §2: contracts are ring 2.
- **Risk:** a TDZ crash if an enum is placed below `BlastRadius` or `PrHistory` (`server/INSIGHTS.md:44`). It is caught at import, not at typecheck.

### W2 — Facade fixes in repo-intel: per-symbol cap, self-caller exclusion, honest `degraded`/`reason`
- **Do:**
  - **Nothing else consumes the facade.** `grep -rn "getBlastRadius" server/src` finds only `repo-intel/service.ts` and `types.ts`. The only test is `test/repo-intel-facade-degraded.test.ts`. `getCallerSignatures` (the reviews prompt-assembly path) is a separate method and is NOT touched. Re-run the grep before starting. If a new consumer has appeared, check it still type-checks and add it to this item.
  - `types.ts`:
    - `BlastCallerRow` gains `declFile: string`, the file that declares `viaSymbol`. The ripgrep path sets it to `sym.file`.
    - `BlastResult` gains `indexStatus?: IndexStatus` and `indexedSha?: string`.
    - Update the header comment at `types.ts:53-55`. "In T1 the facade returns degraded" is stale.
  - `repository.ts`: `getResolvedCallers` also selects `declFile: t.references.declFile`, and `ResolvedCallerRow` gains it.
  - New `repo-intel/helpers.ts`, pure:
    - `excludeSelfCallers(rows)` drops a row whose `file === declFile`.
    - `capCallersPerSymbol(rows, max)` groups by `viaSymbol`. It sorts each group by rank desc, file asc, line asc, keeps the top `max`, then flattens and sorts by rank desc.
    - `fallbackReason({ flagOn, state })` returns a `DegradedReason` using the order in Key decision 7.
  - `service.ts` `getBlastRadius` / `tryPersistentBlast`:
    - **(a)** Replace `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` (`service.ts:396`) with `capCallersPerSymbol(excludeSelfCallers(callers), MAX_CALLERS_PER_SYMBOL)`.
    - **(b)** When `state.status === 'partial'`, return `degraded: true, reason: 'index_partial'` with the data. When it is `full`, return `degraded: false`. Both carry `indexStatus` and `indexedSha: state.lastIndexedSha`.
    - **(c)** Flag off: the ripgrep fallback runs as today but returns `reason: 'flag_off'`.
    - **(d)** In the ripgrep fallback, `reason` comes from `fallbackReason`, not a hardcoded `'no_data'` (`service.ts:243,312`). The fallback also applies `excludeSelfCallers` + `capCallersPerSymbol`, which today is uncapped. It builds `factsByFile` with `{ endpoints: extractEndpoints(content), crons: [] }` from the caller files it already reads (`service.ts:300-304`). One mapping path downstream is then enough. It sets `indexedSha` from the state when one exists.
    - Update the stale class header (`service.ts:1-18`) and the method comments to describe the new reason semantics.
    - No new imports of `adapters/**` or `platform/container`.
  - Tests:
    - New `server/test/repo-intel-blast.test.ts`, no DB, patching `svc.repo` as `repo-intel-facade-degraded.test.ts:34-40` does. Cover:
      - a `full` index with 25 callers of symbol A and 3 of symbol B returns 20 + 3, not 20 total;
      - a self-caller row, where `fromPath` equals `declFile`, is dropped;
      - a caller in another changed file is KEPT;
      - `partial` returns `degraded: true, reason: 'index_partial'` and still returns callers;
      - flag off returns `reason: 'flag_off'`;
      - no state row returns `reason: 'no_data'`;
      - a `failed` state returns `index_failed`.
    - Plus pure tests of the three helpers.
    - Tighten `repo-intel-facade-degraded.test.ts:54-65` to `expect(blast.reason).toBe('flag_off')`.
- **Files:** `repo-intel/{types.ts,helpers.ts,repository.ts,service.ts}`, `server/test/repo-intel-blast.test.ts`, `server/test/repo-intel-facade-degraded.test.ts`.
- **Done means:**
  - The seven cases above pass.
  - `grep -n "slice(0, MAX_CALLERS_PER_SYMBOL)" server/src/modules/repo-intel/service.ts` finds nothing.
  - `grep -n "reason: 'no_data'" server/src/modules/repo-intel/service.ts` finds no hit inside `getBlastRadius`. The `getIndexState`/`getRepoMap` defaults are a different method and may keep theirs.
  - `pnpm arch:check` still reports 20 warnings / 0 errors.
- **Verify:** in `server/`: `pnpm typecheck`; `pnpm exec vitest run test/repo-intel-blast.test.ts test/repo-intel-facade-degraded.test.ts`; `pnpm arch:check`.
- **Rules that apply:**
  - onion-architecture §1: the rules move to ring-1 `helpers.ts` so they test without Docker. §5: the file is known debt, so do not extend it.
  - drizzle-orm-patterns: adding the selected column must not change the join.
- **Risk:** medium. This is a behaviour change on a shared facade. It is mitigated by there being no other consumer, and by the degraded test.

### W3 — Server `blast` module: `GET /pulls/:id/blast`
- **Do:**
  - `blast/repository.ts` (`BlastRepository(db)`):
    - `getPullWithRepo(workspaceId, prId)` returns `{ prId, number, repoId, openedAt: Date|null, owner, name } | undefined`. It joins `pull_requests` to `repos`, filtering `pullRequests.workspaceId` AND `repos.workspaceId`.
    - `getPrFilePaths(prId)` returns `string[]`, `ORDER BY path`.
  - `blast/helpers.ts`, pure:
    - `toBlastRadius(result: BlastResult): BlastRadius` implements every rule in Key decision 5. It maps `indexStatus` to `index_status` and `indexedSha` to `indexed_sha`, and copies `degraded`/`reason`.
    - `blastSummary(counts)` builds the count string.
    - `emptyBlastRadius(reason)` is used for `files_unavailable`.
    - Map `DegradedReason` to `BlastDegradedReason` 1:1, with an exhaustive `switch` so that a new facade reason fails typecheck.
  - `blast/service.ts`:
    - `new BlastService({ repo, repoIntel, github })`. `repoIntel` is typed `Pick<RepoIntel, 'getBlastRadius' | 'getFileRank'>`. `github` is `() => Promise<GitHubClient>`, the same shape as `IntentDeps.github` (`intent/service.ts:61-62`).
    - `get(workspaceId, prId)`:
      - Look up the pull, or throw `NotFoundError('Pull request not found')`.
      - Resolve changed files (Key decision 3).
      - With zero files and GitHub unavailable, return `emptyBlastRadius('files_unavailable')`.
      - With zero files after a GitHub success, return `toBlastRadius` of an empty result: not degraded, "0 symbols".
      - Otherwise make ONE `repoIntel.getBlastRadius(repoId, files)` call, then `toBlastRadius`.
      - Put the private `resolveChangedFiles` on the service. W9 reuses it.
  - `blast/routes.ts`:
    - `app.get('/pulls/:id/blast', { schema: { params: IdParams, response: { 200: BlastRadius } } }, …)`, with the composition done in the plugin: `new BlastService({ repo: new BlastRepository(app.container.db), repoIntel: app.container.repoIntel, github: () => app.container.github() })`.
    - `getContext` runs first.
    - Header comment in the style of `smart-diff/routes.ts:9-16`, stating "no LLM; reads the repo-intel index; may make one GitHub call when pr_files is empty".
  - `modules/index.ts`: `import blast from './blast/routes.js'` plus a `blast` entry.
  - Tests:
    - `server/test/blast-helpers.test.ts` covers:
      - grouping by viaSymbol;
      - sort order, including ties at rank 0;
      - endpoints/crons per group coming ONLY from that group's caller files;
      - per-caller endpoints;
      - `counts` and `summary` for 0 and many;
      - `factsByFile` absent → empty endpoint lists, no throw;
      - the reason mapping;
      - a changed symbol with no callers counted in `changed_symbols` but absent from `downstream`.
    - `server/test/blast-service.test.ts` uses fakes and covers:
      - `pr_files` present → no GitHub call;
      - `pr_files` empty → `getPullRequest` called once and its paths passed to `getBlastRadius`;
      - GitHub throws `ConfigError` → `files_unavailable`, with `getBlastRadius` NOT called;
      - `getBlastRadius` called exactly once per request;
      - an unknown PR → `NotFoundError`.
    - `server/test/blast.it.test.ts` builds the app with `overrides.repoIntel` as a stub and `overrides.github` as `MockGitHubClient`. Cover:
      - 200 + schema-valid body for a seeded PR with `pr_files`;
      - a PR with no `pr_files` → the stub receives the mock's file paths;
      - a PR id from another workspace → 404.
- **Files:** `server/src/modules/blast/{constants.ts,helpers.ts,repository.ts,service.ts,routes.ts}`, `server/src/modules/index.ts`, the three tests. `constants.ts` may stay empty until W9. If so, create it in W9 instead.
- **Done means:**
  - `GET /pulls/:id/blast` is registered (the `.it` test passes).
  - Its response validates against `BlastRadius`.
  - `grep -n "Container" server/src/modules/blast/service.ts` finds nothing.
  - `grep -n "drizzle-orm\|db/schema" server/src/modules/blast/routes.ts` finds nothing.
  - `grep -rn "20\b" server/src/modules/blast/helpers.ts` finds no hardcoded caller cap.
  - `pnpm arch:check` stays at 20 warnings / 0 errors.
- **Verify:**
  - In `server/`: `pnpm typecheck`; `pnpm exec vitest run test/blast-helpers.test.ts test/blast-service.test.ts`; `pnpm exec vitest run --exclude '**/*.it.test.ts'` (the full unit suite, no new failures); `pnpm arch:check`.
  - With Docker: `pnpm exec vitest run test/blast.it.test.ts`.
- **Rules that apply:**
  - onion-architecture §4: inject ports, not the container. Bans 1 and 3.
  - fastify-best-practices → `rules/schemas.md`: response schema declared; `rules/error-handling.md`: `NotFoundError` goes through the existing error envelope.
  - security A01: the workspace scope is on the pull lookup, and `repoId` never comes from the client.
  - drizzle-orm-patterns: explicit `orderBy`.
- **Risk:** the unrequested GitHub call when `pr_files` is empty. It is bounded to one call and only happens on that path.

### W4 — Client hook `usePrBlast` + resync-and-refresh
- **Do:** Create `client/src/lib/hooks/blast.ts` with `"use client"` and `api` from `../api`:
  - `usePrBlast(prId)` → `useQuery({ queryKey: ["pr-blast", prId], queryFn: () => api.get<BlastRadius>(\`/pulls/${prId}/blast\`), enabled: !!prId })`.
  - `useBlastResync(repoId, prId)` composes `useResyncRepoIntel(repoId)` and `useRepoIntelStatus(repoId, polling)` from `lib/hooks/repo-intel.ts:31-50`. It records the index state's `updatedAt` at click time. While `polling` is on, a change in `updatedAt` invalidates `["pr-blast", prId]` and stops polling. The effect exists only to react to server state; it is the "external system" case in react-best-practices → useEffect Rules. It stops after `RESYNC_POLL_MAX_MS` (a constant in the same file, 120 s). It returns `{ start, isRunning }`.
  - `import type { BlastRadius } from "@devdigest/shared"` only.
  - `blast.test.ts`, modelled on `reviews.test.ts`:
    - the query URL and key are right;
    - `enabled` is false with no prId;
    - resync invalidates the blast query once `updatedAt` advances.
- **Files:** `client/src/lib/hooks/blast.ts`, `client/src/lib/hooks/blast.test.ts`.
- **Done means:**
  - The tests pass.
  - `grep -n "import {" client/src/lib/hooks/blast.ts | grep devdigest/shared` finds nothing, meaning no value import.
- **Verify:** in `client/`: `pnpm typecheck`; `pnpm exec vitest run src/lib/hooks/blast.test.ts`.
- **Rules that apply:**
  - frontend-ui-architecture §5: server data lives in query hooks, never in `useState`.
  - react-best-practices → Hooks: clean up the interval/flag.
- **Risk:** low.

### W5 — Client `BlastRadiusCard` (summary, tree, empty, degraded + Resync) on the Overview tab
- **Do:**
  - `page.tsx:143` passes `repoId`, `repoFullName` (`page.tsx:88`) and `headSha={pr.head_sha}` to `OverviewTab`. `OverviewTab` renders `<BlastRadiusCard …/>` after `<IntentCard/>`. Keep the stacked layout. The mock's 2-column grid (`screen_pr_detail.jsx` `BriefCard`) is NOT adopted, because the Risk areas half does not exist yet.
  - `BlastRadiusCard/`:
    - It is a container using `usePrBlast` and `useBlastResync`.
    - Header: `SectionLabel icon="Workflow"` with `t("title")`. Right side: the Tree/Graph toggle (W7 fills Graph; until then only Tree renders, and the toggle is added in W7) and, when degraded, the badge.
    - States, as early returns:
      - loading: `Skeleton` rows (`SKELETON_ROWS` in `constants.ts`);
      - error: `ErrorState` with retry;
      - `changed_symbols.length === 0`: `EmptyState` with `t("noSymbols")`;
      - `downstream.length === 0`: `t("noDownstream", {count})`;
      - otherwise summary + tree.
  - `_components/BlastSummary`: four stats from `counts` (icons `Code`, `CornerDownRight`, `Globe`, `Clock`, labels `stat.*`), laid out as the mock's `BlastRadiusSummary` (`blast.jsx`). Use `toLocaleString("en-US")` for numbers (`client/INSIGHTS.md:40`).
  - `_components/BlastTree`:
    - One collapsible row per `downstream` item: chevron, `Code` icon, `` `${symbol}()` `` in mono, and `callerCount` on the right. The first group is open by default. Open state is local `useState<Record<string, boolean>>`.
    - Caller rows use `CornerDownRight` and `MonoLink href={githubBlobUrl(repoFullName, data.indexed_sha ?? headSha, c.file, c.line)}` showing `` `${c.file}:${c.line}` `` (it opens `_blank` + `noopener`). With no `repoFullName`, render plain mono text and no link.
    - Endpoint chips: `Badge mono icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)"`.
    - Cron chips, in their OWN row below: `Badge mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)"`. The values come from `blast.jsx` `BlastRadiusTree`.
  - Degraded badge: `Badge color="var(--warn)" dot` showing `t("degraded.badge")`, with `title={t(\`degraded.reason.${reason}\`)}`. The reason sentence is also shown inline under the header. Next to it goes `Button size="sm" kind="ghost"` for `t("resync")` / `t("resyncing")`, calling `start()`. The button is hidden for `files_unavailable`, where the reason text says to open the PR or configure a token.
  - Extract the mock with a small Node script written to the scratchpad with `Write`, NOT with a Bash heredoc (`client/INSIGHTS.md:13,42`). Use `blast.jsx`, `data.jsx` (`BLAST`, `HISTORY`) and `screen_pr_detail.jsx` from `DevDigest Design (standalone) (3).html` at the repo root.
  - `helpers.ts` (pure): `callerHref(...)`, `isDegraded(data)`.
  - Update `blast.json` with every key listed under Contract changes.
  - Tests in `BlastRadiusCard.test.tsx`, mocking `@/lib/hooks/blast` as `IntentCard.test.tsx:15-19` does and loading `messages/en/blast.json`. Cover:
    - the summary shows the four counts;
    - a caller link `href` equals `https://github.com/o/r/blob/<indexed_sha>/<file>#L<line>` and has `target="_blank"`;
    - it falls back to `headSha` when there is no `indexed_sha`;
    - endpoints and crons render as separate chip groups;
    - the empty state appears when `downstream` is `[]`;
    - the degraded badge shows the reason text, and clicking Resync calls `start`;
    - no rendered text matches `/^blast\./`, meaning no raw key leaks.
- **Files:** `page.tsx`, `OverviewTab/OverviewTab.tsx`, `BlastRadiusCard/**` (without Graph/PriorPrs yet), `client/messages/en/blast.json`.
- **Done means:**
  - All the listed tests pass.
  - `grep -rn "className=" .../BlastRadiusCard` finds no Tailwind utility classes.
  - Every visible string comes from `blast.json`.
  - `pnpm build` succeeds.
- **Verify:** in `client/`: `pnpm typecheck`; `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard"`; `pnpm test` (no new failures); `pnpm build` (dev server stopped; afterwards `rm -rf client/.next` before restarting dev, per `client/INSIGHTS.md:26`).
- **Rules that apply:**
  - frontend-ui-architecture §1: route-local home, since there is one consumer. §2: anatomy and a narrow `index.ts`. §7: `styles.ts` and CSS vars, never mixing shorthand with longhand.
  - react-best-practices → Key Prop Patterns: key on `symbol` / `` `${file}:${line}` ``, never the index. Conditional Rendering: `count > 0 &&`. Accessibility: the toggle and chevron buttons have `aria-expanded`/`aria-pressed`.
  - next-best-practices → directives: the `"use client"` entry stays where it already is (OverviewTab), so no new directive is needed in children.
- **Risk:** medium. `OverviewTab` gains props, and any existing test rendering it must pass them (grep `OverviewTab` in tests first).

### W6 — MCP: real `get_blast_radius`
- **Do:**
  - **First** edit `docs/plans/devdigest-mcp.plan.md`:
    - The D5 row (`:164`) becomes: result = one call → symbols, callers, endpoints and crons; args unchanged; response = `BlastRadiusResult`; errors lead onward.
    - The D9 row (`:321`) text becomes, verbatim: `Show what a pull request can affect, read from the DevDigest code index: symbols declared in the changed files, their callers (file:line), and the HTTP endpoints and crons behind them. No LLM call.` It is ≤250 chars, 2 sentences, and contains no "e.g.".
    - Copy the same string into `mcp/src/tools/descriptions.ts`.
  - `core/limits.ts`: `MAX_BLAST_SYMBOLS = 10`, `MAX_BLAST_CALLERS_PER_SYMBOL = 5` (display caps).
  - `core/results.ts`, `BlastRadiusResult` in mcp's own `z`:
    ```
    { pr, summary, counts:{symbols,callers,endpoints,crons}, degraded:boolean,
      reason?:string, index_status?:string,
      symbols:[{symbol, callers:string[] /* "file:line name" */, more_callers:int,
                endpoints:string[], crons:string[]}],
      truncated:boolean, trust:"untrusted", hint?:string, url }
    ```
    There is no root `anyOf` (`tools-list-budget.test.ts` second case).
  - `core/mappers.ts`: `toBlastResult(blast: BlastRadius, prLabel, url)` and `blastResultToText(result)`. The text starts with `UNTRUSTED_PREFIX`, because symbol names and paths are repository content (the D5 envelope rule, `devdigest-mcp.plan.md:195-200`). It shows the counts line, then per symbol `name() — N callers`, `  ↳ file:line (caller)`, and the endpoints and crons, then `Open in DevDigest: <url>`. When `degraded` is set, `hint` names the reason and the resync action at `<webUrl>/repos/<repoId>/pulls/<n>`. For `files_unavailable`, the hint says to open the PR in DevDigest first.
  - `ports/devdigest-api.ts`: `blastRadius(prId: string): Promise<BlastRadius>`, type-only import.
  - `adapters/http-client.ts`: `request(\`/pulls/${prId}/blast\`, BlastRadius, { timeoutMs: syncFetchTimeoutMs, endpointLabel: 'GET /pulls/:id/blast' })`.
  - `app/queries.ts`: `getBlastRadius(api, webUrl, repoFullName, number)` calls `resolveRepoAndPr` (`app/resolve.ts:51-59`), then `api.blastRadius(pr.id)`, then `toBlastResult`. A 404 from blast is rethrown as `ToolError('not_found', \`PR #${n} not found in ${repo}…\`)`. The resolve step already gives the onward text for an unknown repo or PR.
  - `tools/get-blast-radius.ts`:
    - `registerGetBlastRadius(server, { api, webUrl, log })`, with `outputSchema: BlastRadiusResult.shape` and `annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }`.
    - Map errors with `toErrorResult`. Build the result with `toToolResult` (pattern `tools/get-findings.ts`).
    - Delete `NOT_IMPLEMENTED_TEXT`.
    - `ToolErrorKind` `not_implemented` may stay; it is harmless.
  - `server.ts:34`: pass the deps.
  - `test/fake-api.ts`: add `blast: Record<string, BlastRadius>` to the state and to `emptyState()`, plus `blastRadius(prId)`, which throws `ToolError('not_found')` when the entry is missing.
  - Rewrite `test/tools.get-blast-radius.test.ts`:
    - a resolved PR → `isError` false, `structuredContent.counts` equal to the fake's `counts`, a caller string `"a.ts:23 publicRouter"`, and text starting with the untrusted prefix;
    - more than 5 callers → `more_callers` > 0 and `truncated: true`;
    - degraded with `index_partial` → a hint containing "resync";
    - an unknown PR number → `isError` with text containing `PR #`;
    - invalid args are still rejected (keep the existing case).
  - `mappers.test.ts`: add a pure `toBlastResult` case.
  - `mcp/README.md:31`: update the row.
- **Files:** everything under `mcp/` listed in the table, `docs/plans/devdigest-mcp.plan.md`, `mcp/README.md`.
- **Done means:**
  - `tools-list-budget.test.ts` passes: exactly 5 tools, bytes ≤ 8192, and the description equals D9 verbatim.
  - The stderr line `[tools-list-budget] tools/list size: N bytes` shows N ≤ 8192. Record N in the report.
  - The rewritten tool tests pass.
  - `pnpm arch:check` in `mcp/` reports 0 violations.
  - `grep -n "not implemented" mcp/src/tools/get-blast-radius.ts` finds nothing.
- **Verify:** in `mcp/`: `pnpm typecheck`; `pnpm test`; `pnpm arch:check`; `pnpm build`, then `grep -c "BlastRadius" dist/index.js`, which must be ≥1 (the shared schema is inlined, `mcp/INSIGHTS.md:9`).
- **Rules that apply:**
  - onion-architecture `mcp.md`:
    - rule 1 `core-is-pure` / `core-no-outer-rings`: `toBlastResult` takes the shared type only type-only, and nothing from ports (`mcp/INSIGHTS.md:13`);
    - rule 3 `app-no-outward`;
    - rule 4 `tools-no-driven-adapters`.
  - security A05 (injection into the model): the untrusted prefix.
- **Risk:** the byte budget. If N > 8192:
  1. first drop `index_status` and `hint` from the output SCHEMA. They stay in the text.
  2. then shorten the D9 description, in the plan table and the code together.

  Do not remove `outputSchema` without asking the caller.

### W7 — Graph view + Tree/Graph toggle (P3)
- **Do:**
  - In `BlastRadiusCard`, add a two-`Button` toggle (`kind="ghost" size="sm" active=…`), the same pattern as `DiffTab.tsx:110-128`, using `view.tree` / `view.graph`. Default is `tree`. The state is local `useState` in the card.
  - `_components/BlastGraph`:
    - SVG with three columns: changed symbol → callers (by `name`) → endpoints + crons, following the mock's `BlastRadiusGraph` in `blast.jsx`.
    - It graphs ONE symbol, chosen with a small `Dropdown` (`vendor/ui/kit/Dropdown.tsx`; `client/INSIGHTS.md:15`) labelled `graph.symbolPicker`. The default is `downstream[0]`.
    - Edges: symbol→every caller. Caller→endpoint/cron ONLY when that caller's own `endpoints`/`crons` (the W1 optional fields) contain it.
    - Callers above `GRAPH_MAX_CALLERS` (8) collapse into one `graph.more` node (`+N more`).
    - Endpoint nodes use `var(--accent)` strokes, cron nodes `var(--warn)`.
    - A legend row uses `graph.legend.*`.
    - `role="img"` + `aria-label={t("graph.ariaLabel")}`.
    - Empty (no downstream) shows `graph.empty`.
  - Pure layout goes in `BlastRadiusCard/helpers.ts`: `buildGraphLayout(impact, { width, height, maxCallers })` returns `{nodes, edges}`, and node labels are clipped the way the mock does it (`>16` chars → `…`).
  - Tests:
    - `helpers.test.ts`: node count with and without overflow; no caller→endpoint edge when the caller has no endpoints; deterministic coordinates.
    - Card test: the toggle switches to an element with role `img`.
- **Files:** `BlastRadiusCard/{BlastRadiusCard.tsx,helpers.ts,helpers.test.ts,constants.ts,styles.ts}`, `BlastRadiusCard/_components/BlastGraph/**`, `blast.json`.
- **Done means:** the helper and card tests above pass, and the graph renders no edge that the data does not support.
- **Verify:** in `client/`: `pnpm typecheck`; `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard"`.
- **Rules that apply:**
  - frontend-ui-architecture §4: the pure layout goes in `helpers.ts`, testable without a renderer. §3: Graph is its own component, not a `renderGraph()`.
  - react-best-practices → Render Factories.
- **Risk:** low.

### W8 — GitHub port method for PR history (both vendored `adapters.ts`, Octokit, mock)
- **Do:**
  - Add `PathPullRequest` and `listMergedPullsForPath` to both `adapters.ts` copies, byte-identical.
  - `OctokitGitHubClient.listMergedPullsForPath`, wrapped in `withRetry(withTimeout(…, TIMEOUT))`:
    - `octokit.rest.repos.listCommits({ owner, repo, path, per_page: opts.maxCommits })` walks the default branch.
    - Then, for each unique sha, `octokit.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha })`.
    - Keep items with `merged_at != null` and map them to `{ number, title, author: user?.login ?? 'unknown', merged_at }`. De-duplicate by number and sort by `merged_at` desc.
  - `MockGitHubClient`: `MockGitHubOptions.pathPulls?: Record<string, PathPullRequest[]>`. It returns `pathPulls[path] ?? []`.
  - Add the method to the hand-rolled stub at `server/test/intent.it.test.ts:182-199` (`async () => []`).
  - Check `server/test/adapters.test.ts` and add a mock case if it tests mock methods.
- **Files:** both `adapters.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`, `server/test/intent.it.test.ts`, maybe `server/test/adapters.test.ts`.
- **Done means:**
  - Both sync tests pass.
  - Server and client `pnpm typecheck` are clean.
  - `grep -n "listMergedPullsForPath" server/src/adapters/github/octokit.ts server/src/adapters/mocks.ts server/test/intent.it.test.ts` shows all three.
- **Verify:**
  - In `server/`: `pnpm typecheck`; `pnpm exec vitest run test/vendor-shared-sync.test.ts test/adapters.test.ts`; `pnpm arch:check`.
  - In `client/`: `pnpm typecheck`; `pnpm exec vitest run src/test/vendor-shared-sync.test.ts`.
- **Rules that apply:**
  - onion-architecture §2: the port is justified because it crosses the network and is substituted in tests. The port names no Octokit type.
  - security: the token is never logged or echoed.
- **Risk:** the Octokit method names are confirmed only against the current docs, not against the installed package, because `node_modules` was absent when researched (see Open questions Q2). `pnpm typecheck` settles it immediately.

### W9 — Server `GET /pulls/:id/history` (in the `blast` module)
- **Do:**
  - `blast/constants.ts`: `MAX_HISTORY_PATHS = 5`, `MAX_COMMITS_PER_PATH = 5`, `MAX_HISTORY_ITEMS = 5`, `HISTORY_DEADLINE_MS = 20_000`.
  - `blast/helpers.ts`:
    - `pickHistoryPaths(files, ranks, max)`: the highest `percentile` first, then path asc.
    - `buildPrHistory(perPath: {path, pulls}[], currentNumber, prOpenedAt: string|null, max)`:
      - de-duplicate by `number` and exclude `currentNumber`;
      - `files_overlap` = the sorted paths that returned that PR;
      - sort by `merged_at` desc and cap at `max`;
      - `notes` is deterministic: `Merged N days before this PR was opened; overlaps K changed file(s).`, or just the overlap clause when `prOpenedAt` is null or later than `merged_at`.
    - `merged_at` is passed through as the ISO string.
  - `blast/service.ts` `history(workspaceId, prId)`:
    - Look up the pull, or `NotFoundError`.
    - Run `resolveChangedFiles` (W3). With none, return `{ history: [] }`.
    - Call `repoIntel.getFileRank(repoId, files)`, then `pickHistoryPaths`.
    - Call `github()`. `ConfigError` returns `{ history: [], reason: 'no_github' }`.
    - For each path, call `listMergedPullsForPath(ref, path, { maxCommits: MAX_COMMITS_PER_PATH })`. Wrap the whole fan-out in `withTimeout(…, HISTORY_DEADLINE_MS)` from `platform/resilience.ts`. Collect per path with `Promise.allSettled`.
    - If every path failed, return `{ history: [], reason: 'github_error' }`. Otherwise return `buildPrHistory(...)`, adding `reason: 'github_error'` when some paths failed.
  - `blast/routes.ts`: `app.get('/pulls/:id/history', { schema: { params: IdParams, response: { 200: PrHistory } }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, …)`.
  - Tests:
    - `blast-helpers.test.ts`: de-dup, excluding the current PR, overlap merge, sort, cap, and the notes text for both branches.
    - `blast-service.test.ts`:
      - `ConfigError` → `no_github`;
      - one path rejects and one resolves → partial history plus `github_error`;
      - calls to `listMergedPullsForPath` ≤ `MAX_HISTORY_PATHS`.
    - `blast.it.test.ts`: 200 + schema-valid with `MockGitHubClient({ pathPulls })`.
- **Files:** `blast/{constants.ts,helpers.ts,service.ts,routes.ts}`, the three server tests.
- **Done means:**
  - The tests above pass.
  - The GitHub call count per request is ≤ `MAX_HISTORY_PATHS`, and each call uses `maxCommits = MAX_COMMITS_PER_PATH`. Both are asserted.
  - No token gives 200 with `reason: 'no_github'`, never 5xx.
  - `pnpm arch:check` stays at 20 warnings.
- **Verify:** in `server/`: `pnpm typecheck`; `pnpm exec vitest run test/blast-helpers.test.ts test/blast-service.test.ts`; `pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm arch:check`; with Docker, `pnpm exec vitest run test/blast.it.test.ts`.
- **Rules that apply:**
  - security A06: bounded external calls and a rate limit.
  - `server/INSIGHTS.md:11`: bound with OUR `withTimeout`. A race frees the response, not the work, so keep the fan-out small.
  - fastify-best-practices → `rules/schemas.md`.
- **Risk:** GitHub latency. It is bounded by the deadline and is lazy on the client.

### W10 — Client "Prior PRs touching these files" (lazy)
- **Do:**
  - `lib/hooks/blast.ts`: `usePrHistory(prId)` → `useQuery({ queryKey: ["pr-history", prId], queryFn: …/history, enabled: !!prId, staleTime: HISTORY_STALE_MS })`, with `HISTORY_STALE_MS` = 5 min.
  - `BlastRadiusCard/_components/PriorPrs`:
    - It sits under a divider inside the card, as the mock's `HistoryAccordion` does in `screen_pr_detail.jsx`.
    - The header button (`aria-expanded`) shows the `History` icon, `history.title` and a chevron. No count badge is shown before opening, because the count is unknown until fetched. After the fetch, a `Badge` shows the count.
    - The list child (`PriorPrsList`) mounts only when open, so the hook fires lazily (`client/INSIGHTS.md:11`).
    - Each row shows `#number` linked to `githubPrUrl` (`lib/github-urls.ts:16`) in a new tab, the title, `history.mergedBy` with author and `formatWhen(merged_at)` (`lib/datetime`), `files_overlap` as mono chips, and `notes`.
    - Other states: `reason === 'no_github'` shows `history.noGithub`; `github_error` with an empty list shows `history.githubError`; an empty list shows `history.empty`.
  - Tests:
    - the list hook is NOT called while collapsed and IS called after clicking the header;
    - rows render;
    - `no_github` shows its text.
- **Files:** `client/src/lib/hooks/blast.ts` (+ test), `BlastRadiusCard/_components/PriorPrs/**`, `BlastRadiusCard.tsx`, `blast.json`.
- **Done means:**
  - The three tests pass.
  - Rendering the Overview tab with the card collapsed triggers zero `/history` requests (asserted via the mocked hook).
- **Verify:** in `client/`: `pnpm typecheck`; `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard" src/lib/hooks/blast.test.ts`; `pnpm test`; `pnpm build` (dev stopped).
- **Rules that apply:**
  - frontend-ui-architecture §3: unrelated open/closed state lives in its own component. §5: the query hook.
  - react-best-practices → Accessibility.
- **Risk:** low.

### W11 — Acceptance run on a real PR (DmytrivDev/dev-digest #8)
- **Do:**
  - Start the stack (`./scripts/dev.sh`; on Windows follow `server/INSIGHTS.md:81`). Ensure `DmytrivDev/dev-digest` is imported and its index state is `full`/`partial`: `curl localhost:3001/repos/<repoId>/index-state`. If needed, `POST /repos/<repoId>/resync` and wait for `updatedAt` to advance.
  - Find PR #8's id via `curl localhost:3001/repos/<repoId>/pulls`.
  - Hit `curl localhost:3001/pulls/<prId>/blast` **before** opening the PR in the UI, to exercise the no-`pr_files` path.
  - Open the PR page's Overview tab. Click one caller link.
  - Run the MCP tool via `pnpm inspect` in `mcp/`, or through Claude Code: `get_blast_radius { repo: "DmytrivDev/dev-digest", pr: 8 }`.
- **Files:** none. Report only.
- **Done means:** the report quotes evidence for each point:
  1. The response validates, and `counts.callers ≥ 2` with real callers of symbols declared in `server/src/modules/reviews/{repository.ts,repository/review.repo.ts,repository/run.repo.ts,service.ts,routes.ts}`.
  2. At least one entry in some `endpoints_affected` (expected from `reviews/routes.ts`).
  3. No caller's `file` equals the declaring file of its group's symbol.
  4. The UI summary row matches `counts`.
  5. The clicked link opens the exact line on GitHub. Quote the URL and the line's text.
  6. MCP `structuredContent.counts` equals the HTTP `counts`.
  7. Setting `REPO_INTEL_ENABLED=false` (or using the seeded demo repo) shows the degraded badge with the reason text.
  8. The Prior PRs panel opens and lists PRs, or shows `no_github` when there is no token.
- **Verify:** the manual commands above, with the stack running. Never run `./scripts/e2e.sh` against the dev DB (root `CLAUDE.md`).
- **Rules that apply:** none beyond the above.
- **Risk:** If the index predates PR #8's base, or new `mcp/` files are absent from the default-branch index, those files contribute no symbols. This is expected: see Assumptions.

---

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `pnpm typecheck` | `server/` | pnpm | clean |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server/` | pnpm | all green. The suite was 291/291 on 2026-09-22 (`server/INSIGHTS.md:69`). Do not label any red test "known-failing" (`.claude/skills/pr-self-review/baseline.json` has `known_failing_tests: []`). |
| `pnpm exec vitest run test/blast.it.test.ts test/intent.it.test.ts` | `server/` | pnpm | green (needs Docker) |
| `pnpm arch:check` | `server/` | pnpm | 0 errors, warnings **= 20** (the baseline, `server/INSIGHTS.md:9`); any increase is a finding |
| `pnpm typecheck` | `client/` | pnpm | clean |
| `pnpm test` | `client/` | pnpm | green, including `src/test/vendor-shared-sync.test.ts` |
| `pnpm build` | `client/` | pnpm | succeeds (dev server stopped; `client/INSIGHTS.md:41`) |
| `pnpm typecheck` | `mcp/` | pnpm | clean |
| `pnpm test` | `mcp/` | pnpm | green, `tools/list` ≤ 8192 bytes (report N) |
| `pnpm arch:check` | `mcp/` | pnpm | 0 violations (all rules are `error`, `mcp.md` "six enforcement rules") |
| `pnpm build` | `mcp/` | pnpm | succeeds; `dist/index.js` contains the inlined shared schema |

No `reviewer-core` or `e2e` command is needed: neither package is touched.

## Assumptions

- `repoIntelEnabled` is ON by default (`test/repo-intel-facade-degraded.test.ts:9`, "the default is now ON").
- The index reflects the repo's **default branch at `last_indexed_sha`**, not the PR head. Symbols that exist only in the PR, such as brand-new files, have no index rows, so they contribute no changed symbols until merged and re-synced. This is inherent to "read the index, no re-parse", and the degraded/summary text must not claim otherwise.
- `pull_requests.repo_id` joins to `repos.id`, and both tables carry `workspace_id` (`server/CLAUDE.md` multi-tenancy).
- The `GET /pulls/:id` GitHub path returns at most 100 files (`octokit.ts:79-84`; researcher: listFiles caps at 100 per page and 3000 in total). A PR with more files gets a blast over its first 100. This is pre-existing and out of scope.
- `file_facts.crons` holds display strings, e.g. `reset-rate-buckets (hourly)`, the same shape as the endpoints `METHOD /path` (`repo-intel/types.ts:77-83`). If the indexer emits something else, render it verbatim.
- next-intl in this repo accepts ICU plural syntax in messages. If a test shows otherwise, keep `{count} callers`.
- `Workflow`, `Code`, `CornerDownRight`, `Globe`, `Clock` and `History` exist in `client/src/vendor/ui/icons.tsx`, as the mock uses them. If one is missing, pick the closest existing icon; do not add icon code.

## Open questions

Each has a default the implementer applies unless the caller overrides it. None blocks the start.

- **Q1: which SHA do caller links use?** Default: `indexed_sha ?? headSha` (Key decision 6), because it is exact against the index that produced the line. Override "headSha" makes it exactly what the brief said, at the cost of drift on callers in changed files.
- **Q2 (researcher, Not established):** the exact resolved `@octokit/plugin-rest-endpoint-methods` version could not be checked, because `server/node_modules` was absent. The method names `repos.listCommits` and `repos.listPullRequestsAssociatedWithCommit` are confirmed only against the current octokit.js v22 docs. The first `pnpm typecheck` in W8 settles it. If a name differs, use `this.octokit.request('GET /repos/{owner}/{repo}/commits', …)` / `'GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls'` with the same semantics.
- **Q3 (researcher, Not established):** GitHub does not publish exact secondary rate-limit thresholds. Default: the fixed 30-call ceiling plus a 10/min route limit is treated as sufficient. Revisit only if a 403 secondary-limit error shows up in W11.

## Research used

- **Question:** For "PRs that touched a path", which GitHub REST endpoints and Octokit methods apply, what are their per-call semantics and limits, and can search do it in one call?
  - **Relied on:**
    - `octokit.rest.repos.listCommits({path, per_page≤100})` takes one path per call and walks the default branch unless `sha` is given.
    - `octokit.rest.repos.listPullRequestsAssociatedWithCommit` returns the merged PR that introduced a default-branch commit. It includes `merged_at`, `number`, `title` and `user.login`, with no preview header.
    - `/search/issues` has no path qualifier, so there is no single-call alternative.
    - The authenticated REST limit is 5,000/h, and search is 30/min.
    - `pulls.listFiles` returns ≤100 per page and ≤3000 in total.
  - **Sources:**
    - docs.github.com/en/rest/commits/commits#list-commits
    - …#list-pull-requests-associated-with-a-commit
    - docs.github.com/en/rest/search/search#search-issues-and-pull-requests
    - docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
    - docs.github.com/en/rest/pulls/pulls#list-pull-requests-files
    - octokit.github.io/rest.js/v22
  - All read 2026-09-26.

## Rollback / blast radius

- **Revert by files.** Reverting all touched files fully undoes the feature. There is no migration, no seeded row and no persisted artefact. The blast routes are read-only and write nothing, not even `pr_files`.
- **Facade behaviour (W2)** changes what `getBlastRadius` returns: the cap becomes per symbol, self-callers are removed, and the reason becomes honest. Nothing else consumes it today (grep in W2). Reverting W2 alone while keeping W3 leaves blast working with the old global cap and `no_data` tags. That is degraded but valid.
- **Vendored contract/port (W1, W8).** Both copies must be reverted together, or the sync tests go red in both packages. Every added contract field is optional, so a partial revert of the client never breaks parsing.
- **MCP (W6).** Reverting restores the stub. The D9 table in `docs/plans/devdigest-mcp.plan.md` must be reverted with `descriptions.ts`, or `tools-list-budget.test.ts` fails, by design.
- **External side-effects:** W9 and W10 make read-only GitHub API calls (≤30 per history open). Nothing is written to GitHub.
