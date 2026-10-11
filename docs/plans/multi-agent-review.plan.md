# Implementation plan: Multi-Agent Review

**Route** — A (spec-driven).
**Requirements source** — `specs/SPEC-08-multi-agent-review.md` (Status: approved, 0 `[NEEDS CLARIFICATION]` markers; `node scripts/check-specs.mjs` passes). This plan implements those requirements. It does not define or change them.
**Execution mode** — multi-agent, 3 lanes, **hard cap of 3 lane `implementer` dispatches**. The user chose this on 2026-10-10. There is no integration executor: the caller (main session) runs the integration checks itself.
**Testing scope** — on 2026-10-10 the user decided that **this workflow writes no tests** (rev. 2):
- Implementers create no new test files and add no new test cases.
- Every acceptance criterion whose spec `Verify` names a unit or integration test is checked here by `plan-verifier` reading the code, plus the caller's manual or browser check where the behaviour is observable.
- The tests themselves are listed under **Deferred tests** for a later `test-writer` run.
**Subagent budget for implementation** — 3 lane implementers, 1 `architecture-reviewer`, 1 `plan-verifier`, and at most 2 fix-mode implementers. That is 7 at most.
**Out of scope** — every spec Non-goal (`SPEC-08:38-56`):
- cancel on the results page, and the 409 in-progress guard;
- "also flagged by" chips, rationale-derived notes, and did-not-flag reasons;
- similarity or range-capped grouping;
- URL state for the mode or the agent selection;
- medians;
- the no-PRs empty state, and a run history list;
- a per-agent timeout, and stored agent colours;
- Reply to author, and a working Learn;
- the other GLOBAL items;
- the SSE workspace check (OQ-1).

Also out of scope: anything in `ci/`, `agent-runner/` or `reviewer-core/` (worktree boundary), every new automated test (see above), and a separate security review.

## Design in one paragraph

The simplest shape that meets the spec:
- **Storage.** One nullable column, `agent_runs.multi_agent_run_id`. It is an FK to the existing `multi_agent_runs` table with `ON DELETE SET NULL`, has an index, and comes from one generated migration.
- **Execution.** The executor's sequential `for` loop becomes `Promise.all`. That one change makes both start paths concurrent (AC-16). Diff and intent are still loaded once before the fan-out, so AC-17 holds as it does today.
- **New module `server/src/modules/multi-agent/`.**
  - It validates the request, creates the parent row, and then calls the existing `ReviewService.runReview` with an optional parent id. No second executor is written.
  - It reads columns through the existing workspace-scoped `ReviewRepository.reviewForRun`, so findings come only through each child's own review id (NFR-7).
  - It computes groups, takes, conflicts and totals as pure ring-1 functions in `helpers.ts`. The overlap rule is the existing `findingMatches` (`server/src/modules/eval/helpers/scoring.ts:50-65`).
- **Client.**
  - The PR-page dropdown and the `/multi-agent` and `/multi-agent/[id]` routes are built from the vendored kit (`Checkbox`, `Toggle`, `CircularScore`, `EmptyState`, `ErrorState`, `SelectInput`, `Drawer`) and `formatCost`.
  - `RunTraceDrawer` and `FindingCard` are reused unchanged. They are first **promoted** to `client/src/components/`, because a second route now uses them.
  - Polling is a TanStack `refetchInterval` of 3 s, active while the run's status is running.

## Requirements traceability

How each requirement is checked:
- **PV** — `plan-verifier` reads the code against the work item's `Done means`.
- **M*n*** — the caller's manual or browser check *n* (Verification plan, step 4).
- Every requirement whose spec Verify was a unit or integration test also appears under **Deferred tests**.

| Req | Requirement (short) | Source | Work items | Checked by |
|---|---|---|---|---|
| AC-1 | Dropdown: "Pick agents to run", Clear, checked rows per enabled agent, run button, Configure agents…; no Run all or single items; merged warning kept | `SPEC-08:75-82` | W3, W11 | PV + M1 |
| AC-2 | No enabled agent → muted "No enabled agents — configure agents" | `:84-85` | W11 | PV |
| AC-3 | `/multi-agent` heading, step 1 PR select (`#n · title`, `?pr=` preselect), step 2 | `:87-91` | W12 | PV + M2 |
| AC-4 | No PR → "Pick a pull request first" | `:93-94` | W12 | PV + M2 |
| AC-5 | Select all + checked card per enabled agent | `:96-97` | W12 | PV + M2 |
| AC-6 | No enabled agent → "Enable agents to run reviews" + Go to Agents | `:99-100` | W12 | PV |
| AC-7 | `Run multi-agent review (N)`; disabled at N=0, no PR, pending | `:102-103` | W11, W12 | PV + M1, M2 |
| AC-8 | Exactly one `POST /pulls/:id/multi-agent-run` with the checked ids | `:105-106` | W10, W11, W12 | PV + M1 (network tab) |
| AC-9 | Navigate to `/multi-agent/<id>` on success | `:108-109` | W11, W12 | PV + M1, M2 |
| AC-10 | Estimate display and footer rules | `:111-114` | W10, W11, W12 | PV + M2 |
| AC-11 | Estimates: newest ≤10 done runs, averages | `:118-122` | W6, W7 | PV + M2 |
| AC-12 | One parent, one run per distinct agent id | `:124-125` | W5, W6, W7 | PV + M3 |
| AC-13 | Response before any review finishes | `:127-128` | W7 | PV + M3 |
| AC-14 | 422 for bad / disabled ids, no rows | `:130-131` | W1, W6, W7 | PV |
| AC-15 | Foreign PR / agent / parent → 404, no rows | `:133-134` | W7 | PV |
| AC-16 | Every agent's review starts without waiting (both paths) | `:138-139` | W5 | PV + M3 |
| AC-17 | Diff + intent once per set | `:141-142` | W5 | PV + M5 (one "Loading PR diff" line per trace) |
| AC-18 | One agent's failure isolated | `:144-145` | W5 | PV + M6 |
| AC-19 | Diff-load failure fails all with `Failed to load PR diff` | `:147-148` | W5 | PV |
| AC-20 | One column per child, agents-list order, status + error | `:152-153` | W6, W7 | PV + M3, M6 |
| AC-21 | `status`, `total_duration_ms`, `total_cost_usd` rules | `:155-159` | W6, W7 | PV + M3 |
| AC-22 | Column fields + findings with the 4 eval/triage fields | `:161-162` | W1, W7 | PV + M4 |
| AC-23 | Transitive grouping by `findingMatches` | `:166-172` | W6 | PV + M4 |
| AC-24 | One take per child, five states | `:174-178` | W6 | PV + M4 |
| AC-25 | `is_conflict` rule | `:180-181` | W6 | PV + M4 |
| AC-26 | Grouping leaves finding rows unchanged | `:183-184` | W7 | PV (the read path writes nothing) |
| AC-27 | Results header | `:188-194` | W13 | PV + M3 |
| AC-28 | Columns mode per state, ≤5 equal, >5 scroll | `:196-204` | W13 | PV + M3, M6 |
| AC-29 | Palette i mod 5 | `:206-207` | W10, W12, W13, W14 | PV + M2, M3 |
| AC-30 | Agent tabs + summary card | `:209-210` | W10, W14 | PV + M4 |
| AC-31 | Existing `FindingCard`, accept/dismiss/eval-case unchanged | `:212-213` | W4, W14 | PV + M4 |
| AC-32 | Disabled Learn with "Not available yet" | `:215-216` | W14 | PV + M4 |
| AC-33 | "Where agents disagree" rows + take labels | `:218-219` | W14 | PV + M4 |
| AC-34 | "Show only conflicts" off on load; filters | `:221-222` | W14 | PV + M4 |
| AC-35 | Fewer than two done agents → message; no conflicts → message | `:224-225` | W14 | PV + M4 (one-agent run) |
| AC-36 | Re-read every 3 s while running, stop at done | `:227-228` | W10, W13 | PV + M3 (network tab) |
| AC-37 | View trace mounts the existing `RunTraceDrawer`, visible | `:232-233` | W4, W13 | M5 + PV |
| AC-38 | `?trace=` addressing | `:235-240` | W13 | M5 + PV |
| AC-39 | Drawer content; `running` → Live log | `:242-245` | W4, W13 | M5 + PV |
| AC-40 | A failed or cancelled run's persisted log is shown | `:247-248` | W4, W5 | PV + M6 |
| AC-41 | GLOBAL sidebar item, highlighted on the results URL | `:252-253` | W3 | PV + M7 |
| AC-42 | No raw HTML is interpreted | `:255-256` | W11–W14 | PV (text rendering only; vendored `Markdown` has no rehype-raw) |
| NFR-1 | All new strings in one namespace; no stale texts | `:297-298` | W11–W14 | PV |
| NFR-2 | Keyboard-operable controls with accessible names | `:300-301` | W11–W14 | PV + M1–M4 (keyboard pass) |
| NFR-3 | 3-agent total < 1.5 × 1-agent | `:303-304` | W5 | M8 (compare `total_duration_ms` of the 1- and 3-agent runs) |
| NFR-4 | Recorded 1-vs-3 measurement | `:306-311` | W15 | M8 |
| NFR-5 | Child trace stats + `grounding dropped` log line | `:313-314` | (existing executor; W5 preserves it) | PV + M5 |
| NFR-6 | No model calls beyond N reviews + 1 intent | `:316-317` | W6 | PV |
| NFR-7 | Workspace-confined; findings only via own review ids | `:319-320` | W7 | PV |

## Deferred tests (follow-up, not in this workflow)

These tests come from the spec's `Verify` hints. They belong to a later `test-writer` run, which should start from this list. Every row is currently checked only by PV, plus manual checks where the table above says so.

| Req | Deferred test (spec hint) | Intended file |
|---|---|---|
| AC-1, AC-2, AC-7, AC-8, AC-9, AC-10 (dropdown) | unit: rows, Clear, removed items, merged warning, label, disabled, single call, navigation | `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.test.tsx` (extend) |
| AC-3–AC-10 (configure), AC-29 (cards), AC-42 (PR title) | unit | `client/src/app/multi-agent/_components/ConfigureRunView/ConfigureRunView.test.tsx` |
| AC-10, AC-29, AC-30 (helpers) | unit, table-driven (e.g. `8 200 / 7 400 ms`, `$0.06 / $0.05` → `≈ 8.2s · $0.11 · parallel fan-out`) | `client/src/lib/multi-agent.test.ts` |
| AC-36 | unit, fake timers: 2 reads in 6 s while running, none after done | `client/src/lib/hooks/multi-agent.test.tsx` |
| AC-27, AC-28, AC-29, AC-37 (unit half), AC-38, AC-39 (unit half), AC-42, NFR-1 | unit | `client/src/app/multi-agent/[id]/_components/{MultiAgentResults,AgentColumns}/*.test.tsx` |
| AC-30–AC-35, AC-42 (rationale), NFR-2 | unit | `client/src/app/multi-agent/[id]/_components/{AgentTabs,DisagreementsBlock}/*.test.tsx` |
| AC-40 (client half) | unit: drawer renders a failed run's persisted error line | `client/src/components/RunTraceDrawer/RunTraceDrawer.test.tsx` (extend) |
| AC-41 | unit: NAV item, no Memory / Agent Performance / CI Runs, `activeKeyFor("/multi-agent/x")` | `client/src/components/app-shell/{nav-context,helpers}.test.ts` (extend) |
| AC-11 (rule), AC-12/AC-14/AC-15 (target pick), AC-21 (rule), AC-23, AC-24, AC-25, NFR-6 (grouping is pure) | unit | `server/test/multi-agent-helpers.test.ts` |
| AC-11, AC-12, AC-13, AC-14, AC-15, AC-20, AC-21, AC-22, AC-26, NFR-7 | integration | `server/test/multi-agent.it.test.ts` |
| AC-16, AC-17, AC-18, AC-19, AC-40 (server half), NFR-3, NFR-5, NFR-6 | integration: gated provider stub, `vi.mock` of `diff-loader.js` | `server/test/multi-agent-execution.it.test.ts` |

**Highest priority when picked up:** AC-14, AC-15 and NFR-7, the workspace-scoping criteria. In this workflow only a code read checks them (see Risks).

## Spec follow-ups

For `spec-creator` and the user. None of these is applied here.

1. **AC-16, AC-17 and NFR-6 say "Verify: unit".** The executor needs the database. When the deferred tests are written, these are cheaper as an integration test with a gated provider stub. The checked behaviour is identical.
2. **The e2e parts of AC-37, AC-38 and AC-39 are a manual browser check (M5)** in this workflow, not a new `e2e/` spec.
3. **`AgentColumn` has no start time.** "Running · {elapsed}s" (AC-28) is therefore measured from the parent's `ran_at`. Children are created milliseconds after the parent.
4. **Rev. 2: the user removed all new tests from this workflow.** Every spec `Verify` that names a unit, integration or e2e test is unmet until the **Deferred tests** run happens. The spec itself is unchanged.

## Affected surface

| File | New/Mod | Package | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/vendor/shared/contracts/observability.ts` | Mod | api | Ring 2 | zod | Byte-identical with the client copy (`server/test/vendor-shared-sync.test.ts`). Section order is load-bearing (`server/INSIGHTS.md:56`). Merge hot spot: edit only the "Multi-Agent Review" section (`:18-86`). |
| `client/src/vendor/shared/contracts/observability.ts` | Mod | web | ports copy | zod | Same as above |
| `server/src/db/schema/runs.ts` | Mod | api | Ring 4 (db) | drizzle-orm-patterns, postgresql-table-design | Nullable FK plus an explicit index (Postgres does not auto-index FKs) |
| `server/src/db/migrations/00NN_*.sql` + `meta/*` | New (generated) | api | db | postgresql-table-design | `pnpm db:generate` only. `strict: true` blocks on a rename/drop prompt (`server/INSIGHTS.md:89`), so add only. |
| `server/src/modules/reviews/run-executor.ts` | Mod | api | Ring 3 | onion-architecture | Merge hot spot: replace only the loop at `:139-166` |
| `server/src/modules/reviews/repository/run.repo.ts` | Mod | api | Ring 3 | drizzle-orm-patterns | `createAgentRun` gains optional `multiAgentRunId` |
| `server/src/modules/reviews/repository.ts` | Mod | api | Ring 3 | drizzle-orm-patterns | The wrapper type must match (`server/INSIGHTS.md:43` pattern) |
| `server/src/modules/reviews/service.ts` | Mod | api | Ring 3 (known debt: takes `Container`) | onion-architecture, security | Add a trailing optional param only. Do not refactor the debt. |
| `server/src/modules/multi-agent/constants.ts` | New | api | module constants | onion-architecture | `ESTIMATE_SAMPLE = 10`, start rate limit `10 / 1 minute` |
| `server/src/modules/multi-agent/helpers.ts` | New | api | Ring 1 | onion-architecture | Must be named `helpers.ts` so `core-not-to-io` covers it (`server/.dependency-cruiser.cjs:23`, `server/INSIGHTS.md:60`). Type imports from `@devdigest/shared`, plus `findingMatches` from `../eval/helpers/scoring.js` (ring 1 → ring 1). |
| `server/src/modules/multi-agent/repository.ts` | New | api | Ring 3 | drizzle-orm-patterns | Every query is filtered by `workspace_id` |
| `server/src/modules/multi-agent/service.ts` | New | api | Ring 3 | onion-architecture, security | Inject repositories and a `startRuns` function, never `Container` (`server/INSIGHTS.md:52`) |
| `server/src/modules/multi-agent/routes.ts` | New | api | Ring 4 | fastify-best-practices, security | Schema-first. The composition happens here (the eval precedent, `server/src/modules/eval/routes.ts:35-38`). |
| `server/src/modules/index.ts` | Mod | api | Ring 4 | onion-architecture | One import plus one entry |
| `client/src/vendor/ui/nav.ts` | Mod | web | design system | frontend-ui-architecture | Add a `GLOBAL` group with key `multi-agent`. `activeKeyFor` already maps it (`client/INSIGHTS.md:38`, `client/src/components/app-shell/helpers.ts:31`). |
| `client/src/vendor/ui/kit/Dropdown.tsx` | Mod | web | design system | frontend-ui-architecture, react-best-practices | Optional `children` panel; `items` becomes optional (default `[]`). Every existing caller stays unchanged. |
| `client/src/components/RunTraceDrawer/**` (moved from `app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/`, **with its existing tests**) | Move | web | shared component (second route) | frontend-ui-architecture, react-best-practices | Promote on the second use; the component itself is unchanged |
| `client/src/components/FindingCard/**` (moved likewise, with its existing tests) | Move | web | shared component | frontend-ui-architecture | Replace the deep relative `githubBlobUrl` import (`FindingCard.tsx:23`) with `@/lib/github-urls` |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `_components/DiffTab/DiffTab.tsx`, `_components/FindingsPanel/FindingsPanel.tsx` | Mod | web | route | frontend-ui-architecture, next-best-practices (page) | Import path change only |
| `client/src/lib/multi-agent.ts` | New | web | domain module (`lib/`) | — (unrouted, see gaps) | Pure functions. Type-only imports from `@devdigest/shared`. |
| `client/src/lib/hooks/multi-agent.ts` | New | web | hooks | frontend-ui-architecture, react-best-practices | All access through `lib/api.ts`. A new file, so no existing `vi.mock` factory breaks (`client/INSIGHTS.md:62`). |
| `client/messages/en/multiAgent.json` | New | web | i18n namespace | frontend-ui-architecture | Holds every new string. Auto-loaded by `src/i18n/request.ts:16-24`. |
| `.../RunReviewDropdown/RunReviewDropdown.tsx` | Mod | web | route-local | frontend-ui-architecture, react-best-practices | Keep the props API. `PrDetailHeader` stays untouched. |
| `.../RunReviewDropdown/RunReviewDropdown.test.tsx` | Mod (existing test, mock stub only) | web | test | react-testing-library | Add a `vi.mock("@/lib/hooks/multi-agent", …)` stub so the existing smoke test stays green. Add no new cases. |
| `client/src/app/multi-agent/page.tsx` | New | web | route | next-best-practices | Static route reading `useSearchParams` → wrap the view in `<Suspense>`, or `next build` fails (`client/src/app/eval/page.tsx:3-5`) |
| `client/src/app/multi-agent/_components/ConfigureRunView/{ConfigureRunView.tsx,styles.ts,index.ts}` (+ optional `_components/AgentCard/`) | New | web | route-local | frontend-ui-architecture, react-best-practices | — |
| `client/src/app/multi-agent/[id]/page.tsx` | New | web | route | next-best-practices | Thin page |
| `client/src/app/multi-agent/[id]/_components/{MultiAgentResults,AgentColumns,AgentTabs,DisagreementsBlock}/{X.tsx,styles.ts,index.ts}` | New | web | route-local | frontend-ui-architecture, react-best-practices | No hard-coded hex outside the palette constant |

**Coverage gaps:**
- `client/src/lib/multi-agent.ts` matches no row of `.claude/skill-routing.md`, the same as the existing `lib/cost.ts`.
- `docs/plans/multi-agent-review.verification.md` is unrouted (`docs/**`).
- **Rev. 2:** none of the new code has an automated test. That is a deliberate gap; the coverage it should get is listed under **Deferred tests**.

## Contract changes

- **vendor/shared: yes.** Edit `contracts/observability.ts` in both copies, byte-identical, replacing **only** the "Multi-Agent Review" section (`:18-86`).
  - Remove `AgentColumnFinding`, `Conflict` and `ConflictTake`. A grep on 2026-10-10 found no consumer.
  - Add `import { FindingRecord, ReviewRunTarget } from './review-api.js';`.
  - Declare the new schemas in this order, so no schema references a later `const` (`server/INSIGHTS.md:56`):
    1. `MultiAgentRunRequest = z.object({ agent_ids: z.array(z.string().uuid()).min(1) })`
    2. `MultiAgentRunStarted = z.object({ id, pr_id, runs: z.array(ReviewRunTarget) })`
    3. `AgentRunStatus = z.enum(['running','done','failed','cancelled'])`
    4. `AgentColumn` — the fields at `SPEC-08:391-398` (`agent_id` and `agent_name` nullable; `findings: z.array(FindingRecord)`)
    5. `TakeState = z.enum(['flagged','did_not_flag','failed','cancelled','pending'])`
    6. `FindingTake` — the fields at `:401-403`, with `severity: Severity.nullable()`
    7. `FindingGroup` — the fields at `:399-404`
    8. `MultiAgentRun` — the fields at `:382-390`, with `status: z.enum(['running','done'])`, and `total_duration_ms` and `total_cost_usd` nullable
    9. `AgentRunEstimate` and `AgentRunEstimates` — the fields at `:408-409`
  - Leave the `AgentStats` and Curator sections untouched.
- **Migration: yes.**
  - The column: `agent_runs.multi_agent_run_id uuid NULL REFERENCES multi_agent_runs(id) ON DELETE SET NULL`, plus `index('agent_runs_multi_idx').on(t.multiAgentRunId)`.
  - In `runs.ts`, declare it with `.references(() => multiAgentRuns.id, { onDelete: 'set null' })`. The arrow is evaluated lazily, so declaring `multiAgentRuns` lower in the file is fine.
  - Generate it with `cd server && pnpm db:generate`, which should produce one new file, `0023_*.sql`, on this branch.
- **Seed: no.** Rows come only from user actions. The seeded agents and demo PR #482 are enough for M8.
- **Client build check needed: yes, but not for a value import.** Every client import from `@devdigest/shared` stays `import type` (`client/INSIGHTS.md:22`). The build is needed because the static `/multi-agent` route reads `useSearchParams`, and only `next build` catches a missing Suspense boundary. The caller runs it once, with `pnpm dev` stopped (`client/INSIGHTS.md:47`).
- **i18n: yes.**
  - A new namespace, `client/messages/en/multiAgent.json`, holds every new string, including the dropdown's new strings.
  - The existing `prReview.runReview.*` keys (`mergedWarning`, `mergedTooltip`, `configureAgents`, `runReview`, `running`) are reused unchanged.
  - The stale `runs.page.*` keys stay in the file and are never rendered (NFR-1).

## Work items

**Rule for every work item (rev. 2):** create no new test files and add no new test cases. An implementer may do only the minimum that keeps the **existing** suites green:
- (a) move an existing test together with the component it covers (W4);
- (b) add stubs for new hooks to existing `vi.mock` factories (`client/INSIGHTS.md:62`);
- (c) fix an existing assertion that the concurrent executor or the moved paths break, keeping what it checks. Report every such fix by file and line.

Every `Verify` below is a typecheck plus existing suites, and those suites must stay green.

### Lane L1 — contracts, schema, client groundwork (first; dependency of L2 and L3)

### W1 — Replace the multi-agent contracts in both vendored copies
- **Serves:** enables AC-8, AC-11–AC-15, AC-20–AC-25 (the wire shapes at `SPEC-08:372-414`).
- **Do:** edit the server copy as **Contract changes** describes, then copy it byte-for-byte to the client copy.
- **Files:** `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts`.
- **Done means:**
  - The two files are byte-identical.
  - `AgentColumnFinding`, `Conflict` and `ConflictTake` are gone.
  - Every new schema is declared after everything it references.
  - The existing `contracts.test.ts` still imports the barrel without a TDZ error.
- **Verify:** `node scripts/verify.mjs server test/vendor-shared-sync.test.ts test/contracts.test.ts` and `node scripts/verify.mjs client src/test/vendor-shared-sync.test.ts` (existing tests).
- **Rules that apply:**
  - zod → `type-use-z-infer`: the schema and its inferred type share one name (root `CLAUDE.md`).
  - zod → `object-optional-vs-nullable`.
- **Risk:** a merge conflict with the parallel worktree. Keep the diff inside the one section.

### W2 — Link agent runs to their parent (schema + generated migration)
- **Serves:** enables AC-12, AC-20 (DR-3).
- **Do:**
  1. Add `multiAgentRunId` and its index to `agentRuns` in `runs.ts`.
  2. Run `cd server && pnpm db:generate`.
  3. Never hand-edit or rename the generated file.
- **Files:** `server/src/db/schema/runs.ts`, `server/src/db/migrations/00NN_*.sql`, `server/src/db/migrations/meta/_journal.json`, `server/src/db/migrations/meta/00NN_snapshot.json`.
- **Done means:** the new SQL contains only these three statements:
  - the `ALTER TABLE "agent_runs" ADD COLUMN "multi_agent_run_id" uuid` statement;
  - an FK to `multi_agent_runs.id` with `ON DELETE set null`;
  - `CREATE INDEX "agent_runs_multi_idx"`.
- **Verify:** `cd server && pnpm db:generate && pnpm typecheck`. The integration lane applies the migration for real (`test/helpers/pg.ts` runs `runMigrations`).
- **Rules that apply:**
  - postgresql-table-design → index FK columns.
  - drizzle-orm-patterns → reference through an arrow function.
- **Risk:** the drizzle-kit prompt hang (`server/INSIGHTS.md:89`). If it prompts, stop and report. The generate runs while no other lane is active.

### W3 — Sidebar GLOBAL item + Dropdown panel content
- **Serves:** AC-41; enables AC-1.
- **Do:**
  - (a) In `nav.ts`, append `{ section: "GLOBAL", items: [{ key: "multi-agent", label: "Multi-Agent Review", icon: "Users", href: "/multi-agent" }] }`. The `Users` icon exists (`vendor/ui/icons.tsx`), and the mock uses it (`docs/design/extracted/chrome.jsx:17`).
  - (b) In `vendor/ui/kit/Dropdown.tsx`, make `items` optional (default `[]`) and accept `children?: React.ReactNode`, rendered inside the panel after the items.
  - Add no tests.
- **Files:** `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/kit/Dropdown.tsx`.
- **Done means:**
  - Exactly one NAV group named `GLOBAL` exists. Its only item is `multi-agent`, linking to `/multi-agent`.
  - No group contains Memory, Agent Performance or CI Runs.
  - Every existing `<Dropdown items=…>` caller compiles unchanged.
  - The existing `nav-context.test.ts` and `helpers.test.ts` stay green.
- **Verify:** `node scripts/verify.mjs client src/vendor/ui/nav.ts src/vendor/ui/kit/Dropdown.tsx`.
- **Rules that apply:** frontend-ui-architecture §1 → extend `vendor/ui` rather than adding a parallel popover.
- **Risk:** low.

### W4 — Promote `RunTraceDrawer` and `FindingCard` to `src/components/`
- **Serves:** enables AC-31, AC-37, AC-39, AC-40 (client).
- **Do:**
  1. `git mv` both folders, with their `_components/` and **existing tests**, to `client/src/components/RunTraceDrawer/` and `client/src/components/FindingCard/`.
  2. Update the three importers to `@/components/RunTraceDrawer` and `@/components/FindingCard`.
  3. In the moved files, replace the deep relative imports with `@/` aliases. This covers `FindingCard.tsx:23` and the `vi.mock("../../../../../../../lib/hooks/…")` paths in `RunTraceDrawer.test.tsx:48-51`. The mock change is allowed as "keep existing suites green".
  4. Leave the behaviour and props of both components unchanged, and add no new test case.
- **Files:**
  - `client/src/components/RunTraceDrawer/**` (moved)
  - `client/src/components/FindingCard/**` (moved)
  - `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`
- **Done means:**
  - `grep -rn "_components/RunTraceDrawer\|_components/FindingCard\|\.\./FindingCard" client/src` returns nothing.
  - Every moved existing test, plus the existing DiffTab and FindingsPanel tests, stays green.
- **Verify:** `cd client && pnpm typecheck && NO_COLOR=1 pnpm exec vitest run RunTraceDrawer FindingCard EvalCaseAction SkillsUsedSection DiffTab FindingsPanel`. Name filters are used because related-tests misses bracketed routes (`client/INSIGHTS.md:28`).
- **Rules that apply:** frontend-ui-architecture §1 → promote on the second consumer, and the barrel `index.ts` is the folder's only public face.
- **Risk:** typecheck does not see `vi.mock` path strings. Grep the moved tests for `../../`.

### Lane L2 — server (after L1; parallel with L3)

### W5 — Concurrent execution + parent link plumbing
- **Serves:** AC-16, AC-17, AC-18, AC-19, AC-40 (server), NFR-3, NFR-5 (preserved); enables AC-12.
- **Do:**
  - (a) In `run-executor.ts:139-166`, replace the `for (const { agent, runId } of jobs) { … }` loop with `await Promise.all(jobs.map(async ({ agent, runId }) => { … }))`.
    - Keep the same body: the `try`, the same logging, and the `catch` that only logs.
    - Edit nothing outside that block, except at most the one comment word "in parallel".
    - Diff and intent stay before the fan-out. `failAll` and `runOneAgent`'s per-run persistence stay unchanged.
  - (b) In `run.repo.ts` `createAgentRun`, add `multiAgentRunId?: string | null` and write `multiAgentRunId: values.multiAgentRunId ?? null`.
  - (c) Add the same field to the `repository.ts` wrapper type.
  - (d) Change `service.ts` to `runReview(workspaceId, prId, targets, logger?, multiAgentRunId?: string)` and pass the id to `createAgentRun`. Children are still created one awaited insert at a time, in `targets` order.
- **Files:** `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/repository/run.repo.ts`, `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/service.ts`.
- **Done means:**
  - The `run-executor.ts` diff touches only the loop block. No `await` inside a loop over `jobs` remains, so every job starts before any finishes.
  - The existing `reviews.it.test.ts`, `runs-result.it.test.ts` and `integration.it.test.ts` stay green. Any existing assertion that relied on sequential order is fixed per the rev. 2 rule (c), and the fix is reported.
  - `arch:check` adds no violation against the baseline.
- **Verify:** `node scripts/verify.mjs server src/modules/reviews/run-executor.ts src/modules/reviews/service.ts`, then `cd server && pnpm exec vitest run test/reviews.it.test.ts test/runs-result.it.test.ts test/integration.it.test.ts --no-file-parallelism`. Read the skipped count (`server/INSIGHTS.md:31,115`).
- **Rules that apply:** onion-architecture §5 → `ReviewService` taking `Container` is known debt. Do not copy it and do not fix it.
- **Risk:** **medium.** Every review set now runs concurrently, and concurrent large reviews have hung before (`server/INSIGHTS.md:20`).

### W6 — Pure multi-agent rules (ring 1)
- **Serves:** AC-23, AC-24, AC-25, AC-21 (rule), AC-11 (averaging), AC-12 / AC-14 / AC-15 (target selection), NFR-6.
- **Do:** write `multi-agent/helpers.ts`. It uses type-only imports from `@devdigest/shared` plus `import { findingMatches } from '../eval/helpers/scoring.js'`. Define these functions:
  - `pickTargets(agentsInListOrder, requestedIds)`, returning `{ kind: 'missing' } | { kind: 'disabled' } | { kind: 'ok', targets }`:
    - duplicates collapse, and the order is the agents-list order;
    - an id not in the list gives `missing`;
    - any requested agent with `enabled: false` gives `disabled`.
  - `estimateFrom(agentId, rows)` — rows are newest-first done runs, at most `ESTIMATE_SAMPLE`:
    - `runs_sampled` is the row count;
    - the average `duration_ms` is rounded, or null when there are no rows;
    - the cost is the average of the non-null `cost_usd`, or null when none has one.
  - `rollup(parentRanAt, children)`, per AC-21:
    - a child's finish is `ran_at + duration_ms`;
    - the duration is null while any child is running;
    - the cost is null when no child is done or any done child's cost is null.
  - `buildGroups(columns)`, per AC-23:
    - Consider only the findings of `done` columns, and merge them transitively by `findingMatches` (union-find or sort-and-merge per file).
    - A group's location is its `file` and minimum `start_line`.
    - Its title is that of the highest-severity member (`CRITICAL > WARNING > SUGGESTION`; on a tie, the first by `start_line`).
    - Groups are ordered by `file`, then line, and the `id` is `${file}:${line}`.
  - Takes, per AC-24, in column order:
    - a column with a member finding gives `flagged`, with its highest member severity, `note` set to that finding's title, and `finding_ids`;
    - a `done` column without one gives `did_not_flag`;
    - a running column gives `pending`;
    - `failed` and `cancelled` map to themselves, with a null note.
  - `is_conflict`, per AC-25.
  - `ESTIMATE_SAMPLE = 10` and the rate-limit constants go in `constants.ts`.
- **Files:** `server/src/modules/multi-agent/helpers.ts`, `server/src/modules/multi-agent/constants.ts`.
- **Done means:**
  - `helpers.ts` contains no I/O import (`arch:check`'s `core-not-to-io` stays clean).
  - Each function implements its AC as worded. `plan-verifier` checks this against the spec examples:
    - A 10-12, B 12-20 and C 19-25 form one group at line 10, and D 30-31 forms another;
    - the AC-25 table;
    - the AC-21 cost cases.
- **Verify:** `node scripts/verify.mjs server src/modules/multi-agent/helpers.ts` (typecheck, arch:check, existing related tests).
- **Rules that apply:** onion-architecture §1 → ring 1 is the test-speed ring. The filename rule (`server/INSIGHTS.md:60`) keeps `core-not-to-io` watching this file.
- **Risk:** low. With no unit test, the grouping and conflict logic is checked only by code reading and M4. These are first in line for the deferred tests.

### W7 — Repository, service, routes, registration
- **Serves:** AC-11, AC-12, AC-13, AC-14, AC-15, AC-20, AC-21, AC-22, AC-26, NFR-7.
- **Do:**
  - **`repository.ts`** — `MultiAgentRepository(db)`. Every query filters by `workspace_id`:
    - `createParent(workspaceId, prId)` returns `{ id, ranAt }`;
    - `getParent(workspaceId, id)`;
    - `listChildren(workspaceId, parentId)` reads `agent_runs` left-joined to `agents.name`, ordered by `ran_at asc, id asc`;
    - `doneRunsForEstimate(workspaceId, agentId, limit)` reads `status='done'`, ordered by `ran_at desc`.
  - **`service.ts`** — `MultiAgentService({ repo, reviews, agents, startRuns })`:
    - `reviews` is the type-only `ReviewRepository` (`container.reviewRepo`), and `agents` is the type-only `AgentsRepository` (`container.agentsRepo`).
    - `startRuns` is `(workspaceId, prId, targets: AgentRow[], parentId: string, logger?) => Promise<{ runs: ReviewRunTarget[] }>`.
    - `start`:
      1. Call `reviews.getPull(ws, prId)`; no PR gives 404.
      2. Call `agents.list(ws)`, then `pickTargets`. `missing` raises `NotFoundError`; `disabled` raises `new AppError('agent_disabled', …, 422)`.
      3. Only then call `createParent`, then `startRuns`.
      4. No error path writes a row.
    - `get`:
      - `getParent` (none gives 404), `reviews.getPull` for `pr_number`, `pr_title` and `repo_id`, then `listChildren`.
      - For each child, call `reviews.reviewForRun(ws, child.id)`. This is workspace-scoped, and findings come only by its own review id (`server/INSIGHTS.md:47`; `review.repo.ts:90`).
      - Make one `reviews.evalCaseIdsForFindings(allIds)` call.
      - Build the findings with `findingRowToDto(row, { caseId, reviewAgentId, agentExists })` from `../reviews/helpers.js`. This fills them as the PR reviews response does (`reviews/service.ts:182-203`).
      - Finish with `rollup` and `buildGroups`. The read writes nothing (AC-26).
    - `estimates`:
      - every id must be in `agents.list(ws)`, else 404;
      - one `doneRunsForEstimate` per id, then `estimateFrom`.
  - **`routes.ts`:**
    - `POST /pulls/:id/multi-agent-run` takes `params: IdParams`, `body: MultiAgentRunRequest` and `config.rateLimit { max: 10, timeWindow: '1 minute' }`. Do **not** preprocess a null body: a missing body must give 422 (AC-14; compare `server/INSIGHTS.md:110`).
    - `GET /multi-agent-runs/:id`.
    - `GET /agents/run-estimates` takes `querystring: z.object({ agent_ids: z.preprocess((v) => typeof v === 'string' ? v.split(',').filter(Boolean) : v, z.array(z.string().uuid()).min(1).max(50)) })`.
    - Wire the service here: `const reviewService = new ReviewService(app.container)`, and `startRuns: (ws, pr, targets, parentId, log) => reviewService.runReview(ws, pr, targets, log, parentId)`, passing `req.log`.
  - **`index.ts`:** one import plus a `multiAgent,` entry.
- **Files:** `server/src/modules/multi-agent/repository.ts`, `server/src/modules/multi-agent/service.ts`, `server/src/modules/multi-agent/routes.ts`, `server/src/modules/index.ts`.
- **Done means:**
  - `arch:check` adds no violation: `service.ts` does not import `platform/container`, and `routes.ts` imports neither `drizzle-orm` nor `db/schema`.
  - Every query in `repository.ts` carries a `workspace_id` condition.
  - Findings are read only via `reviewForRun`.
  - The three routes are registered, which the caller confirms by curl or the browser in M2/M3.
- **Verify:** `node scripts/verify.mjs server src/modules/multi-agent/service.ts src/modules/multi-agent/routes.ts src/modules/index.ts`.
- **Rules that apply:**
  - onion-architecture §4 (`server/INSIGHTS.md:52`), ban 1 and ban 3.
  - fastify-best-practices → schema-first.
  - security A01 → workspace scoping on every read.
  - security A06 → the start route's rate limit.
- **Risk:** two facts are **to confirm by the implementer**, with one `curl` against the dev API:
  - `GET /agents/run-estimates` is not captured by `GET /agents/:id` (that would give a 422 from `IdParams`);
  - zod `preprocess` works in a querystring schema (body precedent: `server/src/modules/conventions/routes.ts:55`).

### W8 — (removed in rev. 2) Integration tests: start, read, estimates, scoping
Not in this workflow; see **Deferred tests** (`server/test/multi-agent.it.test.ts`).

### W9 — (removed in rev. 2) Integration tests: execution
Not in this workflow; see **Deferred tests** (`server/test/multi-agent-execution.it.test.ts`).

### Lane L3 — client UI (after L1; parallel with L2)

### W10 — Client data hooks + pure display helpers
- **Serves:** AC-10, AC-29, AC-30 (colour rule), AC-36; enables AC-8, AC-9, AC-11.
- **Do:**
  - **`lib/hooks/multi-agent.ts`:**
    - `useAgentRunEstimates(agentIds)` — key `["agent-run-estimates", ids.join(",")]`, enabled only when there are ids.
    - `useStartMultiAgentRun()` — `POST /pulls/${prId}/multi-agent-run` with `{ agent_ids }`.
    - `useMultiAgentRun(id)` — key `["multi-agent-run", id]`, `refetchInterval: (q) => q.state.data?.status === "running" ? 3000 : false`.
    - All calls go through `lib/api.ts`, with `import type` only.
  - **`lib/multi-agent.ts`:**
    - `PALETTE = ["#ef4444","#f59e0b","#3b82f6","#8b5cf6","#10b981"]`, and `agentColor(i) = PALETTE[i % 5]`.
    - `formatSeconds(ms)` → `"8.2s"` or `"—"`.
    - `approxSeconds(ms)` → `"~8s"` or `"—"`.
    - `cardEstimate(e)` → `"{duration} · {cost}"`, with the cost from `formatCost`.
    - `footerEstimate(selected)` → the time is the max of the non-null averages (`"—"` if none); the cost is the sum (`"—"` if any is null).
    - `scoreColor(score)` → ≥70 `var(--ok)`, ≥50 `var(--warn)`, otherwise `var(--crit)`, and null for null.
  - Add no tests.
- **Files:** `client/src/lib/hooks/multi-agent.ts`, `client/src/lib/multi-agent.ts`.
- **Done means:**
  - `grep -n "from \"@devdigest/shared\"" client/src/lib/multi-agent.ts client/src/lib/hooks/multi-agent.ts` shows only `import type`.
  - The helpers implement AC-10's rules. For example, `8200/7400` ms and `0.06/0.05` give `8.2s` and `$0.11`.
  - The polling stops when the status is not `running`.
- **Verify:** `node scripts/verify.mjs client src/lib/multi-agent.ts src/lib/hooks/multi-agent.ts` (typecheck plus existing related tests).
- **Rules that apply:**
  - frontend-ui-architecture §5 → pure rules go in `lib/`, and hooks are thin adapters.
  - react-best-practices → never copy query data into state.
- **Risk:** low.

### W11 — PR-page agent picker (RunReviewDropdown)
- **Serves:** AC-1, AC-2, AC-7, AC-8, AC-9, AC-10 (dropdown), AC-42, NFR-1, NFR-2.
- **Do:**
  - Render `<Dropdown trigger=… width=…><PickerPanel …/></Dropdown>` with no items. The panel mounts only while the dropdown is open, so every row is checked on each open and the estimates query fires only on open (`client/INSIGHTS.md:11`). `PickerPanel` is a separate top-level component in `_components/PickerPanel/`, or in the same file if it stays under ~60 lines.
  - The panel contains:
    - the merged warning row when `warnMerged` is set;
    - the header "Pick agents to run";
    - Clear;
    - one vendored `Checkbox` per **enabled** agent, in list order, with the name and `approxSeconds(avg)`;
    - the button `Run multi-agent review (N)`, disabled when N is 0 or the start is pending;
    - "Configure agents…" → `/agents`.
  - With no enabled agent, the panel shows only the muted "No enabled agents — configure agents" → `/agents`.
  - On run: `onRunStart?.()`, `mutateAsync({ prId, agentIds })`, `onRunsStarted?.(runIds)`, `router.push(`/multi-agent/${res.id}`)`, and finally `onRunSettled?.()`.
  - Remove "Run all enabled agents" and the single-agent items.
  - In the **existing** `RunReviewDropdown.test.tsx`, add only a `vi.mock("@/lib/hooks/multi-agent", () => ({ useAgentRunEstimates: () => ({ data: undefined }), useStartMultiAgentRun: () => ({ mutateAsync: vi.fn(), isPending: false }) }))` stub. That keeps its smoke test green (`client/INSIGHTS.md:62`). Add no new cases.
- **Files:** `.../RunReviewDropdown/RunReviewDropdown.tsx`, `.../RunReviewDropdown/RunReviewDropdown.test.tsx` (mock stub only), optionally `.../RunReviewDropdown/_components/PickerPanel/*`, and `client/messages/en/multiAgent.json`.
- **Done means:**
  - The panel renders exactly the AC-1 and AC-2 elements.
  - The only start call is the one `useStartMultiAgentRun` mutation with the checked ids, and `useRunReview` is no longer called from this file.
  - The existing smoke test ("Run Review" trigger label) stays green.
- **Verify:** `cd client && pnpm typecheck && NO_COLOR=1 pnpm exec vitest run RunReviewDropdown` (bracketed route).
- **Rules that apply:** react-best-practices → no component defined inside another's render; use real checkboxes (NFR-2).
- **Risk:** low.

### W12 — Configure run screen `/multi-agent`
- **Serves:** AC-3–AC-10, AC-29 (cards), AC-42 (PR title), NFR-1, NFR-2.
- **Do:**
  - `page.tsx` renders `<Suspense><ConfigureRunView /></Suspense>`.
  - In `ConfigureRunView`, inside `AppShell`:
    - With no enabled agent, show the AC-6 `EmptyState` with Go to Agents.
    - Otherwise show the heading "Run a Multi-Agent Review".
    - Step 1 is "Pull request": a `SelectInput` over the `usePulls(useActiveRepo())` PRs that have an `id`, with options `#{number} · {title}`. Hold the choice in local state, initialised from `?pr=`.
    - Step 2 is "Agents to run":
      - with no PR, show the AC-4 empty state;
      - otherwise show Select all and one checked card per enabled agent (`Checkbox`, `Icon.Cpu`, name, description, `cardEstimate`), with the checked border in `agentColor(index)`.
    - The footer shows `≈ {time} · {cost} · parallel fan-out` and the run button, disabled at N = 0, with no PR, or while pending.
    - On success, navigate to `/multi-agent/<id>`.
  - Add no tests.
- **Files:** `client/src/app/multi-agent/page.tsx`, `client/src/app/multi-agent/_components/ConfigureRunView/{ConfigureRunView.tsx,styles.ts,index.ts}`, optionally `.../_components/AgentCard/*`, and `client/messages/en/multiAgent.json`.
- **Done means:**
  - Every AC-3–AC-10 element and state is implemented.
  - The PR title and agent text render as text, with no `dangerouslySetInnerHTML`.
  - `page.tsx` carries the Suspense boundary.
- **Verify:** `node scripts/verify.mjs client src/app/multi-agent/_components/ConfigureRunView/ConfigureRunView.tsx`.
- **Rules that apply:**
  - next-best-practices → Suspense around `useSearchParams` on a static route.
  - `formatCost` for money (`client/CLAUDE.md`).
- **Risk:** a missing Suspense boundary shows up only in `pnpm build`, which the caller runs during integration.

### W13 — Results page: header, Columns mode, trace drawer
- **Serves:** AC-27, AC-28, AC-29 (columns), AC-36 (wiring), AC-37, AC-38, AC-39, AC-42, NFR-1, NFR-2.
- **Do:**
  - `[id]/page.tsx` is thin: `useParams` → `<MultiAgentResults id={id} />`.
  - **`MultiAgentResults`:**
    - `useMultiAgentRun(id)`, with an error giving `ErrorState`.
    - The AC-27 header:
      - a "Configure run" link to `/multi-agent?pr=<pr_id>`;
      - the title;
      - `{n} selected agents · parallel`;
      - the Columns/Tabs control, held in local state and defaulting to Columns, as two buttons with `aria-pressed`;
      - the meta row `#{number}`, the PR title and `{n} agents · parallel · {formatSeconds(total_duration_ms)} total · {formatCost(total_cost_usd)}`.
    - Render `<AgentColumns>` or `<AgentTabs>`, then `<DisagreementsBlock>`. Until W14 lands, a placeholder may stand in for Tabs and Disagreements.
    - The trace parameter:
      - `trace = search.get("trace")`, honoured only if it is one of the columns' `run_id`s;
      - View trace calls `router.replace` with `?trace=<runId>`, and close removes the parameter;
      - render **one** `<RunTraceDrawer key={trace} runId agentName prNumber findings={col.findings} running={col.status === "running"} onClose>` from `@/components/RunTraceDrawer`.
  - **`AgentColumns`:**
    - `repeat(n, minmax(0,1fr))` when n ≤ 5; otherwise fixed tracks with `overflowX: "auto"`.
    - Each header shows `Icon.Cpu`, the name, `{duration} · {cost}` and a 2 px top border in `agentColor(i)`.
    - The body depends on the status:
      - `running` → "Running · {s}s", counted from the parent `ran_at` with a 1 s ticking `now` (an interval, cleaned up);
      - `done` → `CircularScore` plus mini cards (the `SEV` icon, the title, `file:start_line`), then `{n} findings` or "No findings.";
      - `failed` → "Failed", the error, and `—` for score and cost;
      - `cancelled` → "Cancelled" and `—`.
    - View trace appears in every state.
  - The visible text never contains "worktrees", "p-queue" or "Run all agents".
  - Add no tests.
- **Files:** `client/src/app/multi-agent/[id]/page.tsx`, `.../_components/MultiAgentResults/{MultiAgentResults.tsx,styles.ts,index.ts}`, `.../_components/AgentColumns/{AgentColumns.tsx,styles.ts,index.ts}`, and `client/messages/en/multiAgent.json`.
- **Done means:**
  - The AC-27/AC-28 elements and states are implemented.
  - Exactly one drawer is mounted, and only for one of this run's ids.
  - The drawer gets `running` from the column status.
- **Verify:** `cd client && pnpm typecheck && NO_COLOR=1 pnpm exec vitest run app-shell FindingCard RunTraceDrawer`. That means typecheck plus the existing suites nearest to this change. There are no new tests.
- **Rules that apply:**
  - frontend-ui-architecture → URL state only for `?trace=`.
  - react-best-practices → derive rather than store, and clean up the interval effect.
- **Risk:** low to medium. This is the largest item in the lane.

### W14 — Results page: Tabs mode + "Where agents disagree"
- **Serves:** AC-29 (tabs), AC-30–AC-35, AC-42, NFR-1, NFR-2.
- **Do:**
  - **`AgentTabs`:**
    - One `role="tab"` button per agent, showing the name and the score coloured by `scoreColor` (`—` when null).
    - A summary card with `CircularScore`, the name in `agentColor(i)`, the summary or "No summary.", View trace (calling the parent's `onOpenTrace`), and `{duration} · {cost}`.
    - Then `<FindingCard f agentId prId onAction={(a) => action.mutate({ findingId: f.id, action: a }, { onSuccess: () => refetch() })} />`, using `useFindingAction` from `@/lib/hooks/reviews`.
    - After each card, a disabled "Learn" `Button` with `title="Not available yet"`.
  - **`DisagreementsBlock`:**
    - The title, and "Show only conflicts" as a `Toggle` wrapped in a `<label>` with the visible text, which gives it an accessible name. It is local state, off on load.
    - Rows show `file:line`, the title, and one cell per take: the agent name, the label (uppercase severity with a `SEV` dot, `did not flag`, `no result (failed)`, `no result (cancelled)` or `pending`) and the note.
    - The two AC-35 messages.
  - Remove the W13 placeholder.
  - Add no tests.
- **Files:** `.../_components/AgentTabs/{AgentTabs.tsx,styles.ts,index.ts}`, `.../_components/DisagreementsBlock/{DisagreementsBlock.tsx,styles.ts,index.ts}`, `.../_components/MultiAgentResults/MultiAgentResults.tsx`, and `client/messages/en/multiAgent.json`.
- **Done means:**
  - The AC-30–AC-35 elements and states are implemented.
  - Accept and Dismiss go through the existing action for one finding id.
  - Learn never calls the API.
- **Verify:** `node scripts/verify.mjs client` (full client suite; the existing tests must stay green).
- **Rules that apply:**
  - Reuse `FindingCard` unchanged (AC-31).
  - react-best-practices → render a count conditionally with `> 0`.
- **Risk:** `useFindingAction` invalidates only `["reviews", prId]` (`client/src/lib/hooks/reviews.ts:180-202`). The per-call `refetch` is what updates the page once polling has stopped.

### W15 — Manual verification (caller, not an implementer)
- **Serves:** NFR-4, NFR-3 (rev. 2), and the manual halves of the requirements marked M1–M8.
- **Do:** run checks M1–M8 (Verification plan, step 4), then write `docs/plans/multi-agent-review.verification.md`.
- **Files:** `docs/plans/multi-agent-review.verification.md` (written by the caller).
- **Done means:**
  - The file records actual numbers for the 1-agent and 3-agent runs: wall-clock, per-agent and total tokens and cost, findings kept and dropped, and group and conflict counts.
  - It records the NFR-3 ratio of the two `total_duration_ms` values (pass if < 1.5; real models, so stated as observed).
  - It records the NFR-4 same-session checks and the M1–M7 observations.
  - It contains no expected-3× threshold.
- **Verify:** human.
- **Risk:** a long-lived dev DB may hold NULL patches for PR #482 (`server/INSIGHTS.md:34`). Use a fresh `./scripts/e2e.sh` stack or a real PR with diff text.

## Execution

| Lane | Executor | Work items | Files (disjoint) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| L1 — contracts + schema + client groundwork | implementer (lane dispatch 1 of 3) | W1, W2, W3, W4 | both `vendor/shared/contracts/observability.ts`; `server/src/db/schema/runs.ts` + generated migration files; `client/src/vendor/ui/{nav.ts,kit/Dropdown.tsx}`; `client/src/components/{RunTraceDrawer,FindingCard}/**` (moved with their existing tests); PR `page.tsx`, `DiffTab.tsx`, `FindingsPanel.tsx` | — | — | Shared tree. `pnpm db:generate` runs here while no other lane is active. |
| L2 — server | implementer (lane dispatch 2 of 3) | W5, W6, W7 | `server/src/modules/reviews/{run-executor.ts,service.ts,repository.ts,repository/run.repo.ts}`; `server/src/modules/multi-agent/{constants,helpers,repository,service,routes}.ts`; `server/src/modules/index.ts`; plus existing `server/test/*` files only if rule (c) forces a fix | L1 | L3 | Shared tree, server only. Uses Docker for the existing integration suites. |
| L3 — client UI | implementer (lane dispatch 3 of 3) | W10, W11, W12, W13, W14 | `client/src/lib/multi-agent.ts`; `client/src/lib/hooks/multi-agent.ts`; `client/messages/en/multiAgent.json`; `RunReviewDropdown/**` (existing test: mock stub only); `client/src/app/multi-agent/**` | L1 | L2 | Shared tree, client only. No Docker, no build. |

- **Lane dispatches.** Each executor is dispatched with this plan's path **and its lane id**, and touches only its lane's files. L2 and L3 must not edit an L1 file. If one needs a change, the executor reports it and the caller makes it during integration.
- **Rev. 2 test rule (all lanes).** No new test files or cases. The only allowed test edits are moving existing tests with their component, adding stubs to existing `vi.mock` factories, and fixing an existing assertion broken by the concurrent executor or the moved paths. Each such fix is reported.
- **Integration (caller, after L2 and L3).** Run Verification plan step 1. There is no fourth lane dispatch.
- **Review and fix loop.** The cap is 2 fix dispatches:
  1. Dispatch `architecture-reviewer` (step 2) and `security-reviewer` (step 2b) once each, in parallel (both read-only), then `plan-verifier` (step 3) once.
  2. **Fix iteration 1:** dispatch one `implementer` in fix mode with this plan's path plus **all CRITICAL and MAJOR findings from all three reviewers**.
  3. The caller then re-runs the step 1 script checks and checks each named finding directly by reading the cited `file:line`. No reviewer or verifier is dispatched again.
  4. **Fix iteration 2** runs only if iteration 1 left a named finding open. It carries only those open findings, and the caller re-checks it the same way.
  5. After iteration 2, anything still open goes to the user, not to a third fix agent.
  6. MINOR findings are reported to the user and are not fixed in this loop.
- **Total implementation budget:** 3 lane implementers, 1 `architecture-reviewer`, 1 `security-reviewer`, 1 `plan-verifier`, and ≤ 2 fix implementers. At most 8 subagents (security pass added by the user on 2026-10-10, option B: workspace scoping has no automated test in this workflow).

## Verification plan

Review sequence, cheapest first:

**1. Script checks (caller), after the lanes and again after each fix iteration:**

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | Typecheck clean; existing unit suite green; `arch:check` shows no new violation against the baseline |
| `node scripts/verify.mjs client` | repo root | — | Typecheck clean; existing client suite green (a full run, because related-tests misses bracketed routes, `client/INSIGHTS.md:28`) |
| `node scripts/verify.mjs server --it` | repo root | — | Existing integration suites green with **0 skipped**. Run it only when nothing else is using Docker (`server/INSIGHTS.md:97,115`). |
| `cd server && pnpm exec vitest run test/vendor-shared-sync.test.ts` and `cd client && pnpm exec vitest run src/test/vendor-shared-sync.test.ts` | — | pnpm | The vendored copies are identical |
| `grep -n "multiAgent" server/src/modules/index.ts` | repo root | — | One import and one registry entry |
| `pnpm build` | `client/` | pnpm | Builds, which catches the `/multi-agent` Suspense requirement. Stop `pnpm dev` first (`client/INSIGHTS.md:47`). |
| `git diff --stat -- ci agent-runner reviewer-core` | repo root | — | Empty (worktree boundary) |
| `git status --porcelain -- '*.test.ts' '*.test.tsx'` | repo root | — | Only moved tests (W4), the `RunReviewDropdown.test.tsx` mock stub, and any reported rule-(c) fixes. No new test files (rev. 2). |

**2. `architecture-reviewer`** — one dispatch, scoped to the changed files only: the Affected surface table.

**2b. `security-reviewer`** — one dispatch, in parallel with step 2, scoped to `server/src/modules/multi-agent/**` and the `reviews/` files W5 touches. Focus: workspace scoping of every new read and write (AC-14, AC-15, NFR-7), findings reached only through the run's own review ids (`server/INSIGHTS.md:47`), and request validation.

**3. `plan-verifier`** — one dispatch against `docs/plans/multi-agent-review.plan.md`. Requirements marked PV are settled by reading the code against each work item's `Done means`.

**Then the fix loop** (Execution section): at most 2 fix-mode implementer dispatches, with the caller re-checking after each by step 1 plus a direct check of each named finding.

**4. Manual and browser checks (caller, W15).** Do them with the browser pane visible (`client/INSIGHTS.md:21,68`). Use a fresh `./scripts/e2e.sh` stack, or a real PR with diff text.
- **M1 — PR-page picker.**
  - The dropdown shows the header, Clear, and checked rows for enabled agents only, with `~Ns` hints.
  - Clear works, and the button label tracks N. It is disabled at 0, and a double click sends one POST (check the network tab).
  - Success lands on `/multi-agent/<id>`.
  - Keyboard: Tab reaches each control, and Space toggles a checkbox.
- **M2 — Configure run.**
  - `/multi-agent` shows the heading and step 1, and `?pr=` preselects.
  - With no PR, the empty state shows.
  - With a PR, the cards show description and estimate, checked borders in palette colours, and Select all.
  - The footer shows `≈ … · parallel fan-out`.
  - The run lands on the results page.
- **M3 — Results, 3 agents.**
  - The header and meta row show, with no "worktrees" or "p-queue".
  - All three columns read "Running" at the same time (AC-16).
  - The network tab shows a `GET /multi-agent-runs/:id` roughly every 3 s while running, stopping after done (AC-36).
  - Columns fill in with score, cost and findings, then the totals appear.
- **M4 — Tabs and disagreements.**
  - The tabs show coloured scores, and the summary card shows.
  - FindingCard Accept and Dismiss work on one finding; the eval-case action shows after triage; Learn is disabled with its tooltip.
  - Groups keep their authors and original titles, the take labels show, and "Show only conflicts" filters.
  - A 1-agent run shows "Disagreements need at least two finished agents.".
- **M5 — Trace drawer (AC-37, AC-38, AC-39, NFR-5).**
  - View trace on a running column shows a dialog `Agent run · {agent}` in the viewport, on the Live log tab, with streaming lines.
  - A reload with `?trace=<runId>` opens it without a click.
  - Another agent's View trace leaves one drawer.
  - On a done run, the sections show: Configuration, Stats (tokens, cost, grounding), Prompt assembly, Tool calls, Raw output, Findings and Skills used.
  - The log carries exactly one "Loading PR diff" line (AC-17), plus `grounding dropped` lines when the gate dropped a finding.
- **M6 — Forced failure (AC-18, AC-20, AC-28, AC-40).**
  - Run with one agent set to a provider that has an invalid key.
  - The other columns finish.
  - The failed column shows "Failed", the error and `—`.
  - Its trace drawer shows the failure line.
- **M7 — Sidebar (AC-41).** "Multi-Agent Review" sits in GLOBAL and is highlighted on `/multi-agent/<id>`. Memory, Agent Performance and CI Runs are absent.
- **M8 — NFR-4 and NFR-3.**
  - Run 1 agent, then 3 agents, where the single agent is one of the three.
  - Record the measures in `SPEC-08:308`, plus the ratio of the two `total_duration_ms` values (NFR-3, < 1.5 expected).
  - Write everything to `docs/plans/multi-agent-review.verification.md`.

## Assumptions

- **Column order (AC-20)** is the agents-list order at start. Children are created one at a time in `targets` order (`agents.list` orders by `position`, `server/INSIGHTS.md:24`) and read by `ran_at asc, id asc`.
- **The parent's `ran_at`** is the start time used for `total_duration_ms` and for the running elapsed counter.
- **A mix of foreign and disabled ids** gives 404: `pickTargets` checks membership before `enabled`.
- **`Promise.all` never rejects,** because the per-job `catch` swallows. A crash still lands in the existing `.catch` at `server/src/modules/reviews/service.ts:155`.
- **Two Fastify facts are to confirm by the implementer** (W7):
  - static `GET /agents/run-estimates` wins over `GET /agents/:id`;
  - zod `preprocess` works in a querystring.
- **`useAgents()` returns agents in list order,** with `enabled` and `description` (`server/src/vendor/shared/contracts/knowledge.ts:369`).

## Open questions

None.

## Research used

No research was dispatched. Every fact comes from the repository, except the two "to confirm by the implementer" items in W7.

## Risks

1. **Workspace scoping has no automated test in this workflow (rev. 2).** The security review was skipped on the basis that integration tests would cover scoping (AC-15, NFR-7). Those tests are now deferred. AC-14, AC-15 and NFR-7 are checked only by `plan-verifier` reading the code. Consider adding these first when the deferred tests are written.
2. **Concurrency is now the default for every review set,** including MCP `run_agent_on_pr` (EC-34). Concurrent large reviews have hung before (`server/INSIGHTS.md:20`).
3. **Merge hot spots:** `run-executor.ts` and `contracts/observability.ts` (both copies). If the other worktree also generates migration 0023, delete this branch's generated SQL and snapshot after the rebase and re-run `pnpm db:generate`. Never renumber by hand.
4. **Moved tests:** typecheck does not check `vi.mock` path strings, so grep the moved tests for `../../`.
5. **The NFR-3 ratio comes from real models in M8,** not a stub. It is noisier than the deferred integration test, which should be the canonical NFR-3 check later.

## Rollback / blast radius

- **Reverting the files** restores the sequential executor, the old dropdown, and the drawer and card in their old homes.
- **What a file revert does not undo:**
  - **The migration.** On a dev DB that applied it, the column and index stay. That is harmless, because the column is nullable and unused once the code is reverted. Removing them needs a new generated migration.
  - **Rows written while the feature ran.** `multi_agent_runs` rows and the children's links stay in the database.

## Rev. 3 (2026-10-10): user feedback after the manual check

The spec gained AC-43, AC-44 and AC-45, and AC-10 was revised (`specs/SPEC-08-multi-agent-review.md` §I and AC-10). The user approved going straight from the spec edit to implementation.

**Execution.** One `implementer` dispatch, the second and last fix-mode iteration. It covers W16–W19 in order and stays inside the files listed under each item. The rev. 2 test rule still applies: no new test files or cases. Allowed test edits are stubs for new hooks in existing `vi.mock` factories, and fixes to existing assertions broken by the AC-10 change.

### W16 — Footer cost shows the known sum (AC-10 rev.)
- **Files:** `client/src/lib/multi-agent.ts` (`footerEstimate`).
- **Change:** the cost is the sum of the known `avg_cost_usd`, plus a `+` suffix when any selected agent's cost is null. It is `—` only when no cost is known or nothing is selected.
- **Done means:** $0.06 and null give `$0.06+`; all known keeps today's output; all null gives `—`.

### W17 — Contract and server read of a PR's recent runs (AC-44)
- **Files:**
  - both `vendor/shared/contracts/observability.ts` copies, kept byte-identical: add `MultiAgentRunSummary {id, ran_at, status, agent_count, total_duration_ms, total_cost_usd}` and `MultiAgentRunList {runs: MultiAgentRunSummary[]}` at the end of the Multi-Agent section;
  - `server/src/modules/multi-agent/{repository,service,routes,constants}.ts`.
- **Change:**
  - repository: `listParentsForPr(workspaceId, prId, limit)`, newest `ran_at` first, plus a children read for those parent ids. Both are workspace-scoped.
  - service: `recent(workspaceId, prId)`. It checks the PR with the existing scoped `getPull` (404 otherwise), then fills each row's status and totals with the existing `rollup` helper.
  - route: `GET /pulls/:id/multi-agent-runs`, with the `IdParams` uuid.
  - constant: `RECENT_RUNS_LIMIT = 5`.
- **Done means:** `verify.mjs server` passes typecheck, unit tests and arch:check with no new violation; both sync tests pass; a throwaway `app.inject` probe, deleted afterwards, shows newest-first rows and a 404 for an unknown PR.

### W18 — Recent runs list on Configure run (AC-43)
- **Files:**
  - `client/src/lib/hooks/multi-agent.ts`: `useRecentMultiAgentRuns(prId)`, enabled only with a PR, re-reading every 3000 ms while any row is `running`;
  - `client/src/app/multi-agent/_components/ConfigureRunView/**`: a new `_components/RecentRuns/` with a barrel and `styles.ts`, built from existing vendored primitives and `formatCost`;
  - `client/messages/en/multiAgent.json`.
- **Change:** each row shows the start time, `{n} agents`, Running/Done, the total time and the cost, and links to `/multi-agent/<id>`. There is no block when the list is empty.
- **Done means:** the client typecheck passes; the existing `vi.mock("@/lib/hooks/multi-agent")` factories gain a stub for the new hook (grep them first, `client/INSIGHTS.md:62`); the full client suite is green.

### W19 — Remember the last PR (AC-45)
- **Files:**
  - `client/src/lib/multi-agent.ts`: `readLastPr()` and `writeLastPr(id)`, with a localStorage key such as `dd-multi-agent-pr`, each wrapped in try/catch;
  - `ConfigureRunView.tsx`: write the id on PR change, and preselect the stored id when there is no `?pr=` and the id is in the active repo's list;
  - `MultiAgentResults.tsx`: write `run.pr_id` once the run loads.
- **Done means:**
  - typecheck passes and the full client suite is green;
  - opening the sidebar item after selecting a PR preselects it;
  - a stored id that is not in the list leaves the select empty.

**Verification (caller).**
1. `verify.mjs server` and `verify.mjs client`.
2. `cd server && pnpm exec vitest run test/reviews.it.test.ts --no-file-parallelism`.
3. A browser check on `:3100`: the footer `$…+` with API Contract checked, the Recent runs list with a link into a done run, and the sidebar item reopening with the last PR.

No reviewer is re-dispatched (the subagent budget is 8 of 8 after this dispatch). The caller reads the diff.

### W20 — The sidebar item lands on the last run (AC-46), done by the caller on 2026-10-10
- **Files:** `client/src/lib/multi-agent.ts` (`LAST_RUN_KEY` `dd-multi-agent-run`, `readLastRun`, `writeLastRun`), `MultiAgentResults.tsx` and `ConfigureRunView.tsx`.
- **Results page:** it stores its run id, and forgets the id on a 404.
- **Configure run:** opened with no `?pr=` and no `?new`, it redirects in an effect to the stored run. Reading storage in an effect avoids an SSR hydration mismatch.
- **Done means:** the client typecheck passes and the full suite is green.
- **Browser:** the bare `/multi-agent` landed on `/multi-agent/32e037f0…`, and `/multi-agent?pr=…` showed the form with Recent runs.
