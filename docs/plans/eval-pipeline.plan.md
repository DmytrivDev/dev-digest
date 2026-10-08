# Implementation plan: Eval Pipeline — regression harness for review agents (L06)

**Route** — A (spec-driven).
**Requirements source** — `specs/SPEC-04-eval-pipeline.md` (Status: approved; 0 `[NEEDS CLARIFICATION]`
markers, checked with `Grep`). This plan implements those requirements; it does not define or change them.
**Execution mode** — multi-agent (8 runs: 5 server, 3 client; server and client run in parallel after the
contracts lane) — chosen by the user on 2026-10-08.
**Branch** — `lesson-06` (the user's choice; no new feature branch).
**Out of scope** — every Non-goal in the spec (`specs/SPEC-04-eval-pipeline.md:94-129`): case-from-scratch,
per-case runs, Files tab, Promote, 30-days button, cancel, cost estimate, new e2e flow, skill-owned evals,
enrichment replay, variance pinning, "zero findings anywhere" kind, Stats/CI tabs, Learn/Reply, agent
selector, per-route run rate limit. Architecture review and security review are performed by separate agents.

---

## Requirements traceability

Line numbers are `specs/SPEC-04-eval-pipeline.md:<line>`.

| Req | Requirement (short) | Source | Work items | Checked by |
|---|---|---|---|---|
| AC-1 | "Turn into eval case" ghost button, `FlaskConical`, after Dismiss, for eligible triaged finding | :158 | W14 | W14 test |
| AC-2 | no button on an untriaged finding | :164 | W8, W14 | W14 test |
| AC-3 | no button when reason `not_agent_finding` | :168 | W8, W14 | W14 test |
| AC-4 | disabled button + tooltip "Agent no longer exists" on `agent_missing` | :172 | W8, W14 | W14 test |
| AC-5 | "In eval suite" opens `/agents/<id>?tab=evals` with the case modal open | :177 | W14, W16 | W14 + W16 tests |
| AC-6 | one create request per click (pending after first) | :182 | W13, W14 | W14 test |
| AC-7 | label switches to "In eval suite" after 201, no reload | :186 | W13, W14 | W14 test |
| AC-8 | 422 → one toast, human message per reason code | :190 | W13, W14 | W13 + W14 tests |
| AC-9 | accepted finding → `must_find` | :196 | W7 | eval-cases.it |
| AC-10 | dismissed finding → `must_not_flag` | :200 | W7 | eval-cases.it |
| AC-11 | expectation file/start/end = finding's | :204 | W7 | eval-cases.it |
| AC-12 | case agent = `reviews.agent_id` | :208 | W7 | eval-cases.it |
| AC-13 | stored diff = parseable single-file unified diff with all hunks, original new-side numbers | :212 | W3, W7 | eval-case-diff test |
| AC-14 | PR number/title/body frozen | :218 | W7 | eval-cases.it |
| AC-15 | labels + source link on the case | :222 | W6, W7 | eval-cases.it |
| AC-16 | kebab slug ≤60, `-2`/`-3` on collision | :226 | W3, W7 | unit + eval-cases.it |
| AC-17 | existing case → 200, no second row | :233 | W2, W7 | eval-cases.it |
| AC-18 | untriaged → 422 `finding_not_triaged` | :238 | W3, W7 | eval-cases.it |
| AC-19 | no agent → 422 `not_agent_finding` | :242 | W3, W7 | eval-cases.it |
| AC-20 | agent gone → 422 `agent_missing` | :246 | W3, W7 | eval-cases.it |
| AC-21 | NULL patch → 422 `patch_missing` | :250 | W7 | eval-cases.it |
| AC-22 | range outside hunks → 422 `range_outside_hunks` | :254 | W3, W7 | eval-case-diff test |
| AC-23 | diff > 200 KB → 422 `diff_too_large` | :260 | W3, W7 | eval-cases.it |
| AC-24 | re-triage leaves kind unchanged | :264 | W7 | eval-cases.it |
| AC-25 | reviews response carries `eval_case_id` + `eval_ineligible_reason` per finding | :268 | W1, W3, W8 | reviews-eval-fields.it |
| AC-26 | tabs Config · Skills · Context · Evals; `?tab=evals` | :276 | W16 | AgentEditor test |
| AC-27 | four metric cards with deltas for latest completed run | :280 | W16 | EvalsTab test |
| AC-28 | "No runs yet" without a completed run | :285 | W16 | EvalsTab test |
| AC-29 | case row parts; no Run icon | :289 | W16 | EvalsTab test |
| AC-30 | four result-line variants | :299 | W13, W16 | lib/eval + EvalsTab tests |
| AC-31 | "k / N passing" over scored cases | :309 | W16 | EvalsTab test |
| AC-32 | EmptyState with no cases | :313 | W16 | EvalsTab test |
| AC-33 | Run history: last 5, columns, "View full dashboard →" | :317 | W16 | EvalsTab test |
| AC-34 | ConfirmDialog delete removes the row | :322 | W13, W16 | EvalsTab test |
| AC-35 | case edit/delete leaves stored outcomes byte-identical | :327 | W2, W9 | eval-runs.it |
| AC-36 | case modal parts (920 wide, title, subtitle, …) | :334 | W17 | EvalCaseModal test |
| AC-37 | Diff + PR meta tabs read-only | :349 | W17 | EvalCaseModal test |
| AC-38 | diff colours `--code-add` / `--code-del` / `--accent-text` | :352 | W17 | EvalCaseModal test |
| AC-39 | invalid JSON / shape → "invalid JSON" badge, Save disabled | :356 | W13, W17 | EvalCaseModal test |
| AC-40 | valid → "valid JSON" badge | :360 | W17 | EvalCaseModal test |
| AC-41 | PATCH other file → 422 `file_mismatch` | :364 | W7 | eval-cases.it |
| AC-42 | PATCH range outside hunks → 422 `range_outside_hunks` | :368 | W7 | eval-cases.it |
| AC-43 | PATCH empty name → 422 | :372 | W1, W7 | eval-cases.it |
| AC-44 | "Last run" line variants, `formatCost`, null → "—" | :375 | W17 | EvalCaseModal test |
| AC-45 | source line vs "source removed" | :384 | W17 | EvalCaseModal test |
| AC-46 | start → 202, run `running` over cases at that moment, before any model call completes | :390 | W9 | eval-runs.it |
| AC-47 | run records version + effective config at start | :396 | W9 | eval-runs.it |
| AC-48 | review input = case diff + frozen title/body + recorded config only | :402 | W9 | eval-executor test |
| AC-49 | expectation/labels/source text never in a prompt | :411 | W9 | eval-executor test |
| AC-50 | cases run one at a time | :416 | W9 | eval-executor test |
| AC-51 | second start while running → 409 `run_in_progress` | :419 | W2, W9 | eval-runs.it |
| AC-52 | zero cases → 422 `no_cases` | :423 | W9 | eval-runs.it |
| AC-53 | no provider key → 422 `provider_key_missing` | :427 | W9 | eval-runs.it |
| AC-54 | failing case → `errored`, continue | :431 | W9 | eval-executor test |
| AC-55 | 120 s → `errored: timeout`, continue | :435 | W9 | eval-executor test |
| AC-56 | all processed, ≥1 scored → `completed` | :440 | W9 | eval-runs.it |
| AC-57 | all errored → `failed: all_cases_errored` | :444 | W4, W9 | eval-executor test |
| AC-58 | >15 min or restart → `failed: interrupted` | :448 | W6, W9 | eval-runs.it |
| AC-59 | progress `cases_done` / `cases_total` | :453 | W9 | eval-runs.it |
| AC-60 | run continues when client disconnects | :457 | W9 | eval-runs.it |
| AC-61 | "Running k / N cases", run buttons disabled | :461 | W13, W15 | EvalRunButton test |
| AC-62 | labels "Run all evals (N cases)" / "Run eval (N cases)" | :466 | W15 | EvalRunButton test |
| AC-63 | zero cases → run buttons disabled | :470 | W15 | EvalRunButton test |
| AC-64 | 409/422/429 → one mapped toast | :473 | W13, W15 | EvalRunButton test |
| AC-65 | match = same file + inclusive overlap | :479 | W4 | eval-scoring test |
| AC-66 | only grounded findings scored | :485 | W4, W9 | eval-scoring test |
| AC-67 | `must_find` pass rule | :489 | W4 | eval-scoring test |
| AC-68 | `must_not_flag` pass rule | :493 | W4 | eval-scoring test |
| AC-69 | recall | :498 | W4 | eval-scoring test |
| AC-70 | precision | :502 | W4 | eval-scoring test |
| AC-71 | citation accuracy | :508 | W4 | eval-scoring test |
| AC-72 | 0 denominator → null | :512 | W4 | eval-scoring test |
| AC-73 | errored cases excluded everywhere | :517 | W4 | eval-scoring test |
| AC-74 | scoring makes zero model calls | :522 | W4, W9 | eval-scoring + eval-executor tests |
| AC-75 | run cost sum, null if a scored case lacks cost | :527 | W4 | eval-scoring test |
| AC-76 | `duration_ms = finished_at − started_at` | :531 | W9 | eval-runs.it |
| AC-77 | null metric "n/a", null cost "—", whole % | :535 | W13 | lib/eval test |
| AC-78 | sidebar "Eval Dashboard", `Gauge`, `/eval`, active on `/eval/…` | :541 | W18 | nav/helpers test |
| AC-79 | overview: every workspace agent incl. zero-case | :545 | W10, W18 | eval-compare.it + EvalOverview test |
| AC-80 | row → URL-addressable detail | :555 | W18, W19 | EvalOverview + detail tests |
| AC-81 | detail header parts | :560 | W19 | EvalAgentDetail test |
| AC-82 | three metric cards, delta, sparkline ≤20 | :569 | W10, W19 | EvalAgentDetail test |
| AC-83 | trend on 0–1 domain | :574 | W19 | EvalAgentDetail test |
| AC-84 | last 20 runs table with mini bars | :578 | W10, W19 | EvalAgentDetail test |
| AC-85 | regression alert rule (≥0.02 drop) | :583 | W5, W10 | eval-compare test |
| AC-86 | warning banner text + failing cases | :589 | W13, W19 | EvalAgentDetail test |
| AC-87 | Compare enabled only at 2, "2 selected" | :596 | W19 | EvalAgentDetail test |
| AC-88 | other checkboxes disabled at 2 | :600 | W19 | EvalAgentDetail test |
| AC-89 | non-completed runs' checkboxes disabled | :604 | W19 | EvalAgentDetail test |
| AC-90 | earlier run is "old" regardless of order | :610 | W5, W10 | eval-compare test |
| AC-91 | metrics over common cases; only-in lists | :614 | W5, W10 | eval-compare.it |
| AC-92 | prompt line diff | :620 | W5 | eval-compare test |
| AC-93 | config changes old → new | :624 | W5 | eval-compare test |
| AC-94 | per-case flips | :628 | W5 | eval-compare test |
| AC-95 | different agents → 422 `different_agents` | :632 | W10 | eval-compare.it |
| AC-96 | not completed → 409 `run_not_completed` | :636 | W10 | eval-compare.it |
| AC-97 | same run → 422 `same_run` | :640 | W10 | eval-compare.it |
| AC-98 | compare modal title + four cards | :644 | W20 | CompareRunsModal test |
| AC-99 | SYSTEM PROMPT DIFF section with token colours | :652 | W20 | CompareRunsModal test |
| AC-100 | identical prompts → "No changes" | :656 | W20 | CompareRunsModal test |
| AC-101 | config changes, flips, only-in lists | :660 | W20 | CompareRunsModal test |
| AC-102 | Close is the only footer action | :664 | W20 | CompareRunsModal test |
| AC-103 | every eval endpoint 404s across workspaces | :669 | W6, W7, W9, W10 | eval-cases.it, eval-runs.it, eval-compare.it |
| AC-104 | agent delete removes its cases and runs | :675 | W2, W9 | eval-runs.it |
| AC-105 | source deletion keeps case runnable, `source.available=false` | :679 | W2, W6, W9 | eval-runs.it |
| AC-106 | seed: demo PR, real patches, Security Reviewer review ≥10 in-hunk findings | :686 | W11 | eval-seed.it |
| AC-107 | seed: ≥8 linked cases, ≥3 must_not_flag, ≥1 must_find | :692 | W11 | eval-seed.it |
| AC-108 | seed: ≥2 triaged findings without a case | :697 | W11 | eval-seed.it |
| AC-109 | seed idempotent | :701 | W11 | eval-seed.it |
| AC-110 | `pnpm verify:l06` exits 0 with Docker | :707 | W12 | manual (integration step) |
| AC-111 | without Docker exits 0 and prints the skip count | :717 | W12 | manual (integration step) |
| AC-112 | prompt-keyed stub → non-zero recall/precision delta | :722 | W12 | eval-experiment.it |
| AC-113 | live experiment: precision drops after "flag every changed line" | :728 | W11, W20, Integration | manual (screenshot + screencast) |
| NFR-1 | no `sk_live_[0-9A-Za-z]{20,}` in seed/eval fixtures | :797 | W11, W12 | eval-fixtures-secrets test |
| NFR-2 | every new UI string from `messages/en/` | :803 | W13 (+ all client items) | client component tests |
| NFR-3 | keyboard reachable; Escape closes both modals | :808 | W13, W14, W16, W17, W19, W20 | client component tests |
| NFR-4 | untrusted text rendered as text | :815 | W14, W16, W17, W19, W20 | client component tests |
| NFR-5 | diff/body inside untrusted delimiters; imported skills wrapped | :823 | W9 | eval-executor test |
| NFR-6 | ≤1 engine review per case, no other model call | :830 | W9 | eval-executor test |
| NFR-7 | `@devdigest/ui` primitives + tokens, no hex/`rgb(` | :834 | all client items, Integration | manual grep at integration |

---

## Spec follow-ups

These go to `spec-creator` and the user. None of them is applied: this plan implements the spec as written.

1. **AC-70 has two readings of "any `must_not_flag` expectation".** The per-case reading counts a case's findings
   only against that case's own expectation. The run-wide reading counts them against every `must_not_flag`
   expectation in the run. Seeded cases share files from one PR, so the two readings give different numbers.
   The plan uses the **per-case** reading, for two reasons. First, the spec's own `EvalCaseOutcome.findings_matched`
   is defined per case (`:953`). Second, AC-91 recomputes precision over a *subset* of cases, which only the
   per-case form can do (see Assumption A3). The spec should say this explicitly.
2. **AC-58 vs AC-55: 15 min < the worst case of 8 × 120 s.** With 8 cases that each hit the 120 s deadline, the run
   needs 16 min. The 15-minute stale rule then marks a live run `failed: interrupted`. The plan makes the
   executor's final write conditional on `status='running'`, so a reaped run is never overwritten. But a slow
   seeded suite can still end as `interrupted`. Consider either "15 min after the last progress" or
   "cases × 120 s + margin".
3. **AC-50 vs AC-55: one call in flight is not guaranteed after a timeout.** No port carries an `AbortSignal`
   (`server/INSIGHTS.md:11`). A timed-out engine call keeps running in the background while the next case
   starts. AC-50's test (no timeout) still holds. The spec could add "after a timeout, the abandoned call may
   still complete in the background; its result is discarded".
4. **NFR-3 "tabbing reaches each control"** cannot be simulated as written. The client has no
   `@testing-library/user-event` (`client/INSIGHTS.md:175`), and jsdom `fireEvent` does not move focus on Tab.
   The plan checks it as: every control is a native `button`/`a`/checkbox with no `tabIndex=-1`, `focus()`
   works, Space toggles the checkbox, and Escape closes each modal.
5. **The spec's `EvalCaseOutcome` lacks the expectation `kind`.** Recall over common cases (AC-91) and the result
   line (AC-30) both need it. The plan adds `kind` and an `expectation` snapshot to the outcome contract (additive).

---

## Affected surface

Skills come from `.claude/skill-routing.md`. "OA" = onion-architecture, "FUA" = frontend-ui-architecture,
"sec" = security, "fastify" = fastify-best-practices, "drizzle" = drizzle-orm-patterns,
"pg" = postgresql-table-design, "react" = react-best-practices, "next" = next-best-practices,
"RTL" = react-testing-library.

### Server

| File | New/Mod | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|
| `server/src/vendor/shared/contracts/eval-ci.ts` | Mod | ring 2 | zod | byte-identical twin in client (`server/INSIGHTS.md:48`); section order is load-bearing (`:54`) |
| `server/src/vendor/shared/contracts/knowledge.ts` | Mod | ring 2 | zod | delete only the `// ---- Eval ----` block (`knowledge.ts:186-221`) |
| `server/src/vendor/shared/contracts/review-api.ts` | Mod | ring 2 | zod | `FindingRecord` gains nullish fields only (other endpoints return findings without them) |
| `server/test/contracts.test.ts` | Mod | test | — | old `EvalRun` fixture at `:271-291` must go (`server/INSIGHTS.md:97`, `:106`) |
| `server/test/eval-contracts.test.ts` | New | test | — | part of `verify:l06` |
| `server/src/db/schema/eval.ts` | Mod | ring 4 | drizzle, pg | two generate passes (`server/INSIGHTS.md:83`); FK indexes by hand |
| `server/src/db/schema.ts` | Mod | ring 4 | drizzle, pg | `schema` object lists every table (`schema.ts:76-77`) |
| `server/src/db/rows.ts` | Mod | ring 4 | drizzle | row types live here, not in the module (`rows.ts:5-11`) |
| `server/src/db/migrations/0019_*.sql`, `0020_*.sql` + `meta/` | New (generated) | ring 4 | pg | never hand-written; `pnpm db:generate` only (root `CLAUDE.md`) |
| `server/src/modules/eval/constants.ts` | New | ring 1 (constants) | OA | — |
| `server/src/modules/eval/helpers/case-diff.ts` | New | ring 1 | OA | must not import `src/adapters/` (`core-not-to-io`, `.dependency-cruiser.cjs:44`); takes a parsed `UnifiedDiff` |
| `server/src/modules/eval/helpers/eligibility.ts` | New | ring 1 | OA | pure; shared by eval service and reviews service |
| `server/src/modules/eval/helpers/scoring.ts` | New | ring 1 | OA | pure — imports types only (AC-74) |
| `server/src/modules/eval/helpers/compare.ts` | New | ring 1 | OA | pure |
| `server/src/modules/eval/helpers/alert.ts` | New | ring 1 | OA | pure |
| `server/src/modules/eval/helpers/prompt.ts` | New | ring 1 | OA | eval task line; no author field exists on a case |
| `server/src/modules/eval/helpers/dto.ts` | New | ring 1 (mapper) | OA | snake_case DTO out; row types may be imported (`server/INSIGHTS.md:21`) |
| `server/src/modules/eval/repository.ts` | New | ring 3 | OA, drizzle | every read scoped by `workspace_id`; findings via review (`server/INSIGHTS.md:45`) |
| `server/src/modules/eval/service.ts` | New | ring 3 | OA, sec | constructor takes repository + ports, never `Container` (`server/INSIGHTS.md:50`) |
| `server/src/modules/eval/run-executor.ts` | New | ring 3 | OA | no `adapters/`, no `platform/container`; `withTimeout` from `platform/resilience.ts` |
| `server/src/modules/eval/routes.ts` | New | ring 4 | fastify, OA, sec | no drizzle import (Ban 1); composition happens here (`server/INSIGHTS.md:50`) |
| `server/src/modules/index.ts` | Mod | ring 4 | OA | one import + one entry |
| `server/src/app.ts` | Mod | ring 4 | fastify | boot reaping beside the agent-runs reaper (`app.ts:72-85`) |
| `server/src/modules/reviews/helpers.ts` | Mod | ring 1 | OA | `findingRowToDto`/`reviewToDto` gain optional eval info; review prompt untouched |
| `server/src/modules/reviews/service.ts` | Mod | ring 3 | OA, sec | known debt (takes `Container`) — do not extend it; add one query only |
| `server/src/modules/reviews/repository.ts`, `repository/review.repo.ts` | Mod | ring 3 | OA, drizzle | the wrapper and the fn must match (`server/INSIGHTS.md:41` pattern) |
| `server/src/db/seed-eval.ts` | New | ring 4 (data) | — (unrouted by globs? No: `server/src/**/*.ts` → OA) | plain data; `src/db` must not import `src/modules` (`db-not-to-modules`, `.dependency-cruiser.cjs:60`) |
| `server/src/db/seed.ts` | Mod | ring 4 | OA | the block runs AFTER agents are inserted (`seed.ts:279-285`); idempotent |
| `server/package.json` | Mod | — | sec | `verify:l06` script only |
| `server/test/eval-*.test.ts`, `eval-*.it.test.ts`, `reviews-eval-fields.it.test.ts` | New | test | — | DB-backed tests use `.it.test.ts` (root `CLAUDE.md`) |

### Client

| File | New/Mod | Home | Skills | Constraint to respect |
|---|---|---|---|---|
| `client/src/vendor/shared/contracts/{eval-ci,knowledge,review-api}.ts` | Mod | vendored ring 2 | zod | byte-identical to the server copy (`client/src/test/vendor-shared-sync.test.ts`) |
| `client/src/lib/hooks/eval.ts` | New | data hooks | FUA, react | all API access via `lib/api.ts`; `meta.quietError` for answered 4xx (`client/INSIGHTS.md:144`) |
| `client/src/lib/eval.ts` (+ `eval.test.ts`) | New | domain module | FUA | named for the concept; no `utils` |
| `client/messages/en/eval.json` | Mod (rewrite) | i18n | FUA | the existing keys are mock copy with no consumer; a missing key renders raw (`client/INSIGHTS.md:154`) |
| `client/messages/en/prReview.json` | Mod | i18n | FUA | FindingCard strings live here (NFR-2) |
| `client/src/vendor/ui/kit/Modal.tsx` | Mod | design system | FUA | Escape closes when `onClose` is given (NFR-3) |
| `client/src/vendor/ui/kit/Checkbox.tsx` | Mod | design system | FUA | add optional `disabled` + `ariaLabel` (AC-88/89) |
| `client/src/vendor/ui/nav.ts` | Mod | design system | FUA | `activeKeyFor` already maps `/eval` (`client/src/components/app-shell/helpers.ts:39`) |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` (+ test) | Mod | route-local | FUA, react, RTL | `fireEvent`, not user-event (`client/INSIGHTS.md:175`) |
| `…/FindingCard/_components/EvalCaseAction/` (`EvalCaseAction.tsx`, `index.ts`, `styles.ts`, test) | New | route-local child | FUA, react, RTL | — |
| `…/FindingsPanel/FindingsPanel.tsx`, `…/ReviewRunAccordion/ReviewRunAccordion.tsx` | Mod | route-local | FUA, react | pass `agentId` down (AC-5) |
| `client/src/components/EvalRunButton/` (`EvalRunButton.tsx`, `index.ts`, `styles.ts`, test) | New | shared (2 routes) | FUA, react, RTL | two consumers on day one → `src/components` |
| `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `AgentEditor.tsx`, `AgentEditor.test.tsx` | Mod | route-local | FUA, react, RTL | `editor.tabs.evals` key already exists (`client/messages/en/agents.json:56`) |
| `…/AgentEditor/_components/EvalsTab/` (`EvalsTab.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, test, `_components/EvalCaseRow/`, `_components/RunHistory/`) | New | route-local | FUA, react, RTL | — |
| `…/EvalsTab/_components/EvalCaseModal/` (`EvalCaseModal.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, test) | New | route-local | FUA, react, RTL | — |
| `client/src/app/eval/page.tsx` | New | route | next, FUA | static route: no `useSearchParams` (build needs Suspense otherwise) |
| `client/src/app/eval/_components/EvalOverview/` (+ test) | New | route-local | FUA, react, RTL | — |
| `client/src/app/eval/[agentId]/page.tsx` | New | route | next, FUA | — |
| `client/src/app/eval/[agentId]/_components/EvalAgentDetail/` (+ `_components/{RegressionBanner,RunsTable,MiniBar,CompareRunsModal}/`, tests) | New | route-local | FUA, react, RTL | MiniBar composed from tokens (DR-22) |

**Coverage gaps:** `docs/plans/eval-pipeline.plan.md` (this file) and any doc/`INSIGHTS.md` edits are unrouted
by design. `server/src/db/migrations/**` SQL is generated and not hand-reviewed. `typescript-expert` governs no
file here (no tsconfig/`.d.ts` changes planned).

---

## Contract changes

- **vendor/shared: yes.** Both copies, in lock-step, in W1:
  - In `contracts/knowledge.ts`, delete the `---- Eval ----` block: `EvalPerTrace`, `EvalRun`, `EvalOwnerKind`
    and `EvalCase`.
  - In `contracts/eval-ci.ts`, **replace** the "Eval — case input + persisted run record + dashboard" section
    with the new shapes listed in W1. Change its import line from `EvalRun, EvalOwnerKind` to
    `Provider, ReviewStrategy` (still from `./knowledge.js`; a different module, so there is no TDZ).
  - In `contracts/review-api.ts`, add `EvalIneligibleReason` **above** `FindingRecord`. Add two nullish fields to
    `FindingRecord`.

  The only consumer of the removed shapes is `server/test/contracts.test.ts:271-291` (`server/INSIGHTS.md:70`).
- **Migration: yes**, as two generated migrations.
  - **0019 (additions):** new columns on `eval_cases`, plus the new tables `eval_suite_runs` and `eval_case_outcomes`.
  - **0020 (drops):** drop the old per-case `eval_runs` table, and drop `eval_cases.owner_kind`, `owner_id` and
    `input_files`.

  Split for `strict: true` (`server/drizzle.config.ts`) — a pass mixing adds and drops prompts
  rename-or-drop and blocks a non-TTY shell (`server/INSIGHTS.md:83`).
- **Seed: yes.** A new demo PR **#483** in `acme/payments-api`. It has 3 files with real patches and one
  Security Reviewer review with 11 findings: 8 cased (4 `must_find`, 4 `must_not_flag`), 2 triaged without a
  case and 1 untriaged. All of it goes in W11.
- **Client build check needed: yes.** `client/src/lib/eval.ts` gains a **value** import of `EvalExpectation`
  (and the reason-code enums) from `@devdigest/shared`. There are also two new routes. So `pnpm build` in
  `client/` runs at integration (`client/INSIGHTS.md:143`).
- **i18n: yes.**
  - `client/messages/en/eval.json` is rewritten. Namespace `eval`; key groups `common`, `errors`, `runButton`,
    `evalsTab`, `caseModal`, `overview`, `detail`, `compare`, `nav`.
  - `client/messages/en/prReview.json` gains `finding.evalCase.*`.
  - Both are written in W13 only.

---

## Work items

Server tests live in `server/test/`. Every server item's **Verify** also runs `arch:check`, which `verify.mjs`
does by default. The arch:check count must stay at the 20-warning baseline (`server/INSIGHTS.md:9`).

### W1 — Replace the eval contracts in both vendor copies
- **Serves:** enables AC-1…AC-112 (every eval endpoint and screen reads these shapes); AC-25 (FindingRecord), AC-43 (name `min(1)`).
- **Do:**
  - Edit both copies byte-identically, as described in "Contract changes". The new section in `eval-ci.ts` holds,
    in this order:
    - `EvalExpectationKind` = `z.enum(['must_find','must_not_flag'])`.
    - `EvalExpectation`: `{kind, file: string.min(1), start_line: int ≥1, end_line: int ≥1}` with a `.refine`,
      path `end_line`, requiring `end_line >= start_line`.
    - `EvalCaseInputMeta` `{pr_number:int, title:string, body:string|null}`.
    - `EvalCaseLabels` `{severity, category, title: string}`.
    - `EvalCaseSource` `{finding_id:string|null, pr_number:int, repo:string, available:boolean}`.
    - `EvalActualFinding` `{file,start_line,end_line,severity,category,title}`.
    - `EvalCaseOutcome`: the spec's fields (`:948-958`) **plus** `kind: EvalExpectationKind` and
      `expectation: EvalExpectation` (Spec follow-up 5).
    - `EvalCase` (spec `:936-946`; `last_outcome: EvalCaseOutcome.nullable()`).
    - `EvalCaseUpdate` = `z.object({ name: z.string().trim().min(1).optional(), notes: z.string().nullable().optional(), expectation: EvalExpectation.optional() }).strict()`.
    - `EvalRunStatus`, `EvalRunErrorReason` (`all_cases_errored|interrupted`).
    - `EvalRunConfig` `{system_prompt, model, provider: Provider, strategy: ReviewStrategy, skills: {name, version:int}[]}`.
    - `EvalSuiteRun` (spec `:960-970`; `outcomes: EvalCaseOutcome[].optional()`).
    - `EvalRunStartResponse` `{run_id, status: z.literal('running'), cases_total}`.
    - `EvalMetricSet` `{recall, precision, citation_accuracy: number|null}`.
    - `EvalCompare` (spec `:972-980`; `old`/`new` are `EvalSuiteRun`).
    - `EvalAlert` (spec `:982-984`; `metric: z.enum(['recall','precision','citation_accuracy'])`).
    - `EvalTrendPoint` `{started_at, recall, precision, citation_accuracy: number|null}`.
    - `EvalOverviewRow` (spec `:1003`).
    - `EvalDashboard` `{agent:{id,name,provider,model}, cases_total, runs: EvalSuiteRun[], trend: EvalTrendPoint[], alert: EvalAlert|null}`.
    - The reason-code enums `EvalCreateCaseErrorCode` (6 codes, `:990-991`), `EvalUpdateCaseErrorCode`
      (`file_mismatch|range_outside_hunks`), `EvalRunStartErrorCode` (`run_in_progress|no_cases|provider_key_missing`)
      and `EvalCompareErrorCode` (`run_not_completed|different_agents|same_run`).

    Every schema and its type share one name.
  - In `review-api.ts`: `EvalIneligibleReason = z.enum(['not_triaged','not_agent_finding','agent_missing'])`.
    `FindingRecord` gains `eval_case_id: z.string().nullish()` and `eval_ineligible_reason: EvalIneligibleReason.nullish()`.
  - Remove the `EvalRun` parse from `server/test/contracts.test.ts`, and its import. Grep `server/test` and
    `client/src` for every removed name.
  - Add `server/test/eval-contracts.test.ts`. It parses a valid `EvalCase`, `EvalSuiteRun` (with outcomes),
    `EvalCompare` and `EvalDashboard`. It rejects an expectation with `end_line < start_line`, a missing `file`,
    and an `EvalCaseUpdate` with `name: ''`.
- **Files:** both copies of the three contract files, `server/test/contracts.test.ts`, `server/test/eval-contracts.test.ts`.
- **Done means:**
  - Both vendor-sync tests pass (server and client).
  - `grep -rn "EvalRunRecord\|EvalPerTrace\|EvalOwnerKind\|EvalCaseInput\b" server/src client/src server/test` finds nothing.
  - `eval-contracts.test.ts` is green.
  - Importing `@devdigest/shared` under vitest raises no `ReferenceError` (TDZ).
- **Verify:**
  - `node scripts/verify.mjs server test/eval-contracts.test.ts test/contracts.test.ts test/vendor-shared-sync.test.ts`
  - `node scripts/verify.mjs client src/test/vendor-shared-sync.test.ts`
- **Rules that apply:**
  - zod → `type-use-z-infer`, `object-strict-vs-strip` (`.strict()` on the update body), `refine-add-path`.
  - OA §2 → ports stay technology-neutral.
- **Risk:** medium. The client typecheck may surface consumers of the removed shapes (none found today).

### W2 — Reshape the eval tables (two generated migrations)
- **Serves:** enables AC-9…AC-112 (persistence); directly AC-17 (unique `(agent_id, source_finding_id)`), AC-35 (outcomes have no FK to cases), AC-51 (partial unique index), AC-104 (cascade), AC-105 (`ON DELETE SET NULL`).
- **Do:** in `server/src/db/schema/eval.ts`, import `agents` from `./agents` and `findings` from `./reviews` (no cycle).
  - **Pass 1:**
    - `eval_cases` gains five columns:
      - `agent_id uuid NOT NULL → agents.id ON DELETE CASCADE`;
      - `source_finding_id uuid → findings.id ON DELETE SET NULL`;
      - `source_pr_number integer NOT NULL`, `source_repo text NOT NULL`;
      - `labels jsonb NOT NULL`, `created_at timestamptz NOT NULL default now()`.

      Its indexes are `eval_cases_agent_idx(agent_id)` and `uniqueIndex eval_cases_agent_finding_uq(agent_id, source_finding_id)`.
      `expected_output` (jsonb) is kept as the expectation column; `input_diff`/`input_meta`/`notes` are kept.
    - New `eval_suite_runs` table:
      - `id`, `workspace_id → workspaces CASCADE`, `agent_id → agents CASCADE`, `agent_version int NOT NULL`;
      - `status text enum running|completed|failed NOT NULL default 'running'`, `error_reason text`;
      - `config jsonb NOT NULL`, `case_ids jsonb NOT NULL`;
      - `started_at timestamptz NOT NULL default now()`, `finished_at timestamptz`;
      - `cases_total int NOT NULL`, and `cases_done`/`cases_passed`/`cases_scored`/`cases_errored`, each `int NOT NULL default 0`;
      - `recall`/`precision`/`citation_accuracy`/`cost_usd` double, `duration_ms int`.

      Its indexes are `(agent_id, started_at desc)` and `uniqueIndex eval_suite_runs_one_running_uq(agent_id).where(sql\`status = 'running'\`)`.
      The index builder exposes `where(condition: SQL)`, verified in `node_modules/drizzle-orm/pg-core/indexes.d.ts:67`.
    - New `eval_case_outcomes` table:
      - `id`, `run_id → eval_suite_runs CASCADE NOT NULL`;
      - `case_id uuid NOT NULL` (**no FK**), `case_name text NOT NULL`, `kind text NOT NULL`, `expectation jsonb NOT NULL`;
      - `status text NOT NULL`, `pass boolean`, `error_reason text`;
      - `findings_matched`/`findings_total`/`grounding_kept`/`grounding_total`, each `int NOT NULL default 0`;
      - `duration_ms int NOT NULL`, `cost_usd double`, `actual jsonb NOT NULL default '[]'`, `created_at timestamptz NOT NULL default now()`.

      Its indexes are `(run_id)`, `(case_id, created_at desc)` and `uniqueIndex(run_id, case_id)`.

    Then add both new tables to `schema.ts` (`export *` already covers them; add them to the `schema` object),
    and run `pnpm db:generate`. This produces `0019_*.sql`.
  - **Pass 2:** remove `evalRuns`, plus the `ownerKind`, `ownerId` and `inputFiles` columns, from `eval.ts` and
    `schema.ts`. Run `pnpm db:generate` → `0020_*.sql`.
  - Add `EvalCaseRow`, `EvalSuiteRunRow` and `EvalCaseOutcomeRow` to `rows.ts`.
  - Run `pnpm db:migrate`.
- **Files:** `server/src/db/schema/eval.ts`, `server/src/db/schema.ts`, `server/src/db/rows.ts`, the two generated migrations + `migrations/meta/*`.
- **Done means:**
  - **Before migrating**, `select count(*) from eval_cases` and `select count(*) from eval_runs` both return 0 on
    the dev DB. If not, stop and report: the NOT NULL adds without defaults would fail on existing rows
    (`server/INSIGHTS.md:83`).
  - Exactly two new migration files exist, 0019 and 0020, with generated names.
  - Neither `db:generate` run prompted.
  - `pnpm db:migrate` prints `✓ migrations applied`.
  - `\d eval_suite_runs` shows the partial unique index with `WHERE status = 'running'`.
  - `\d eval_case_outcomes` shows no FK on `case_id`.
  - Typecheck is green.
- **Verify:** `node scripts/verify.mjs server` (no files: typecheck + unit + arch), plus `pnpm db:generate` / `pnpm db:migrate` in `server/`.
- **Rules that apply:**
  - pg → index FK columns by hand; `timestamptz`; NOT NULL where required.
  - drizzle → arrow-function `references`.
  - OA → `db/` must not import `modules/`.
- **Risk:** high. This is the one irreversible step (see Rollback). Isolation: **runs alone**, because the
  generator rewrites `migrations/meta`.

### W3 — Ring-1 helpers: case diff, hunk intersection, slug, eligibility
- **Serves:** AC-13, AC-16 (unit), AC-22, AC-23 (size rule); enables AC-18…AC-21, AC-25, AC-41, AC-42.
- **Do:**
  - `server/src/modules/eval/constants.ts`:
    - `CASE_DEADLINE_MS = 120_000`, `STALE_RUN_MS = 15 * 60_000`, `MAX_CASE_DIFF_BYTES = 200 * 1024`;
    - `CASE_NAME_MAX = 60`, `RUN_LIST_LIMIT = 20`, `REGRESSION_DROP = 0.02`;
    - the reason-code string constants, typed from the W1 enums.
  - `helpers/case-diff.ts`:
    - `buildCaseDiff(path, patch)` returns `diff --git a/<path> b/<path>\n--- a/<path>\n+++ b/<path>\n<patch>`, with
      a trailing newline normalised. This is the header shape `parseUnifiedDiff` expects (`server/src/adapters/git/diff-parser.ts:9-12`).
    - `caseDiffTooLarge(diff)` is `Buffer.byteLength(diff,'utf8') > MAX_CASE_DIFF_BYTES`.
    - `rangeIntersectsHunks(diff: UnifiedDiff, file, start, end)` is true when any new-side line number of a hunk
      of `file` lies in `[start,end]`. Use `hunk.newLineNumbers`, falling back to `newStart..newStart+newLines-1`,
      the same rule as `reviewer-core/src/grounding.ts:23-38`.
    - `diffFilePath(diff: UnifiedDiff)` returns the single file's path.

    Ring-1 cannot import the adapter parser. The caller passes the parsed `UnifiedDiff`.
  - `helpers/case-diff.ts`, slug functions:
    - `slugifyTitle(title)`: lowercase; non-alphanumerics → `-`; collapse and trim `-`; cut to 60; trim a trailing `-`.
    - `uniqueCaseName(base, existing: Set<string>)` returns `base`, else `base-2`, `base-3`, ….
  - `helpers/eligibility.ts`:
    - `evalIneligibleReason({ acceptedAt, dismissedAt }, reviewAgentId, agentExists)` returns
      `'not_agent_finding'` when the review has no agent, then `'not_triaged'` when neither timestamp is set,
      then `'agent_missing'` when `!agentExists`, else `null`.
    - The precedence makes AC-4 "triaged + agent gone" → disabled, while untriaged → hidden.
    - The create path maps `not_triaged` → `finding_not_triaged`.
  - `helpers/prompt.ts`: `evalTaskLine({pr_number, title})`. It has the same trusted wording as `taskLine` in
    `modules/reviews/helpers.ts:85-95`, minus the author (a case has no author). Comment why it is not reused.
  - Test file `server/test/eval-case-diff.test.ts`:
    - It parses `buildCaseDiff` output with `parseUnifiedDiff` (tests may import adapters). Exactly one file comes
      back, and its hunks' `newStart`/`newLines` equal those parsed from the raw source patch, for a multi-hunk
      patch (AC-13).
    - A range strictly between two hunks → false; a range touching one added line → true; a removed-only line
      → false (AC-22, EC-7).
    - `"Hardcoded Stripe secret key"` → `hardcoded-stripe-secret-key`; a 100-char title → length 60 (AC-16).
    - The collision helper gives `-2` and `-3`.
    - The eligibility precedence table.
    - Size boundary: exactly `MAX` bytes passes; `MAX+1` fails.
- **Files:** `server/src/modules/eval/constants.ts`, `helpers/case-diff.ts`, `helpers/eligibility.ts`, `helpers/prompt.ts`, `server/test/eval-case-diff.test.ts`.
- **Done means:**
  - The test file is green.
  - `arch:check` shows no new violation.
  - None of the three helper files imports `src/adapters`, `db/client` or `platform/container`.
- **Verify:** `node scripts/verify.mjs server test/eval-case-diff.test.ts`
- **Rules that apply:** OA §1 → default to ring 1. OA `server/INSIGHTS.md:58` → pure files go under `helpers/` so `core-not-to-io` guards them.
- **Risk:** low.

### W4 — Ring-1 scoring
- **Serves:** AC-65…AC-75 (AC-57's status rule; AC-74 by construction).
- **Do:**
  - In `helpers/scoring.ts`:
    - `findingMatches(f, exp)` — same file and inclusive overlap `f.start_line <= exp.end_line && exp.start_line <= f.end_line`.
      Severity, category and title are ignored.
    - `scoreCase(exp, kept: Finding[], droppedCount)` returns
      `{status:'scored', pass, findings_matched, findings_total: kept.length, grounding_kept: kept.length, grounding_total: kept.length+droppedCount, actual}`.
      `must_find` passes iff matched ≥ 1; `must_not_flag` passes iff matched = 0.
    - `aggregateRun(outcomes)` returns `{cases_passed, cases_scored, cases_errored, recall, precision, citation_accuracy, cost_usd}`.
  - The `aggregateRun` formulas:
    - recall = passed `must_find` / scored `must_find`;
    - precision = 1 − Σ `findings_matched` of scored `must_not_flag` cases ÷ Σ `findings_total` of all scored cases
      (per-case reading — Spec follow-up 1);
    - citation = Σ kept ÷ Σ grounding_total over scored cases;
    - any 0 denominator → `null`;
    - errored outcomes are excluded from everything;
    - cost = sum of non-null `cost_usd`, but `null` if any **scored** outcome has `cost_usd === null`.
  - `finalStatus(outcomes)`: `completed` if ≥1 scored, else `{failed, all_cases_errored}`.
  - Test file `server/test/eval-scoring.test.ts` covers every AC verify line at `:479-529`:
    - overlapping, touching (end = start), disjoint, different-file and different-severity pairs;
    - a dropped finding over a `must_not_flag` range does not fail the case (only `kept` is passed in);
    - 3/4 → 0.75; the 20/3 → 0.85 case; kept 9 / dropped 1 → 0.9;
    - null denominators; adding an errored case changes nothing;
    - 0.01 + 0.02 → 0.03 (`toBeCloseTo`); null-cost scored → null;
    - AC-74: scoring runs while an `LLMProvider` stub that throws on any call sits in scope, and its call count stays 0.
- **Files:** `server/src/modules/eval/helpers/scoring.ts`, `server/test/eval-scoring.test.ts`.
- **Done means:** the test file is green, and `scoring.ts` has only `import type` statements (grep).
- **Verify:** `node scripts/verify.mjs server test/eval-scoring.test.ts`
- **Rules that apply:** OA §1 (ring 1 is the test-speed ring).
- **Risk:** low.

### W5 — Ring-1 compare, prompt diff, regression alert
- **Serves:** AC-85, AC-90, AC-92, AC-93, AC-94; enables AC-91, AC-98…AC-101.
- **Do:**
  - `helpers/compare.ts`:
    - `orderRuns(a, b)`: the run with the earlier `started_at` is old (break ties by id).
    - `compareRuns(old, new, oldOutcomes, newOutcomes)` returns:
      - `common_case_ids`, `only_in_old` and `only_in_new` (by `case_id`, names from outcomes);
      - `metrics.old`/`metrics.new` via `aggregateRun` restricted to common case ids;
      - `deltas` (new − old; null if either is null; `cost_usd` uses run-level cost);
      - `config_changes` for `model`, `provider`, `strategy` and `skills` (skills serialised as `name@vN, …` in order);
      - `flips`: cases scored in both whose `pass` differs → `now_passing`/`now_failing`.
    - `promptLineDiff(before, after)` returns `{kind:'context'|'added'|'removed', text}[]`. Port the
      prefix/suffix-stripped LCS of `client/src/app/skills/[id]/_components/SkillEditor/_components/VersionsTab/helpers.ts:28-60`,
      including its 1200-line cap. The server owns the diff, per AC-92.
  - `helpers/alert.ts`: `regressionAlert(completedRunsNewestFirst, outcomesOf)`. There is no alert with fewer than
    2 completed runs. For each metric where both values are non-null and `old − new >= 0.02` (compare with a 1e-9
    epsilon so a drop of exactly 0.02 counts), record a `drop` with both versions. `now_failing` lists the cases
    pass → fail between the two runs. Return `null` if there are no drops and no now-failing cases.
  - Test file `server/test/eval-compare.test.ts`:
    - swapping ids gives the same old/new (AC-90);
    - one inserted line → exactly one `added` (AC-92); identical prompts → all `context`;
    - a model change → one `model` entry; an identical config → none (AC-93);
    - flips in both directions (AC-94);
    - drop 0.02 → alert; drop 0.019 → none; one run → none; null metric → ignored (AC-85).
- **Files:** `server/src/modules/eval/helpers/compare.ts`, `helpers/alert.ts`, `server/test/eval-compare.test.ts`.
- **Done means:** the test file is green; the files are pure (`import type` only, plus the `scoring.ts` import).
- **Verify:** `node scripts/verify.mjs server test/eval-compare.test.ts`
- **Rules that apply:** OA §1.
- **Risk:** low.

### W6 — EvalRepository + DTO mappers
- **Serves:** enables AC-9…AC-105 (all persistence); AC-15/AC-45 (`source.available`); AC-58 (stale reaping queries); AC-103 (scoping).
- **Do:** `server/src/modules/eval/repository.ts` holds `class EvalRepository { constructor(private db: Db) }`.
  Every method takes `workspaceId` and scopes by it. Finding reads go through `reviews.workspace_id`
  (`server/INSIGHTS.md:45`).
  - **Finding context:** `findingForCase(workspaceId, findingId)` returns
    `{finding, review, pull, repoFullName, patch: string|null}`. It joins findings → reviews (workspace-scoped) →
    pull_requests → repos, and reads `pr_files.patch` by `(pr_id, path = finding.file)`. It returns undefined
    outside the workspace.
  - **Cases:**
    - `caseByAgentFinding(agentId, findingId)`, `caseNamesForAgent(agentId)`;
    - `insertCase(values)`: `onConflictDoNothing` on the unique index, returns the row or undefined;
    - `listCases(workspaceId, agentId)`, `getCase(workspaceId, id)`, `updateCase`, `deleteCase`;
    - `sourceAvailable` is `source_finding_id IS NOT NULL`.
  - **Outcomes:** `latestOutcomesForCases(caseIds)` returns the newest outcome per case.
  - **Runs:**
    - `insertRun(values)`: catch the unique violation (Postgres `23505`) and return `'conflict'`;
    - `listRuns(workspaceId, agentId, limit)` newest first; `getRun(workspaceId, id)`; `outcomesForRun(runId)`;
    - `insertOutcome`; `bumpProgress(runId, casesDone)`;
    - `finishRun(runId, values)`, with `WHERE status='running'` and returning a boolean;
    - `latestRunPerAgent(workspaceId)`;
    - `failStaleRuns(workspaceId, olderThan: Date)` → `failed`/`interrupted`/`finished_at=now`;
    - `failAllRunning()`, for boot.
  - **Agents:** `agentsInWorkspace(workspaceId)` (id, name, provider, model) and `caseCountsByAgent(workspaceId)`.
  - `helpers/dto.ts` holds `caseRowToDto(row, lastOutcome)`, `runRowToDto(row, outcomes?)` and
    `outcomeRowToDto(row)`. They emit snake_case DTOs matching W1. A Drizzle row never leaves the module (Ban 3).
- **Files:** `server/src/modules/eval/repository.ts`, `server/src/modules/eval/helpers/dto.ts`.
- **Done means:**
  - Typecheck is green and arch:check shows no new violation.
  - Every public repository method that reads a case/run/finding has a `workspaceId` parameter, or is documented
    as called only with ids from a scoped read (`outcomesForRun`, `insertOutcome`, `bumpProgress`, `finishRun`,
    `failAllRunning`).
  - It is exercised by the W7/W9/W10 integration tests.
- **Verify:** `node scripts/verify.mjs server src/modules/eval/repository.ts src/modules/eval/helpers/dto.ts`
- **Rules that apply:**
  - drizzle → transactions for multi-step writes, explicit `orderBy` (`server/INSIGHTS.md:24`).
  - OA → Ban 3, and repositories as the tenancy chokepoint.
- **Risk:** medium (tenancy).

### W7 — Case use cases + routes + module registration
- **Serves:** AC-9…AC-24, AC-41…AC-43, AC-103 (case endpoints).
- **Do:**
  - **`service.ts`:** `class EvalService` with constructor deps
    `{ repo: EvalRepository; agents: Pick<AgentsRepository,'getById'|'list'|'linkedSkills'>; parseDiff: (raw:string)=>UnifiedDiff; resolveLlm: (p: Provider)=>Promise<LLMProvider>; now?: ()=>Date }`.
    No `Container`.
  - **`createCaseFromFinding(workspaceId, findingId)`**, in order:
    1. Load the context → 404 if absent.
    2. Compute the reason with `evalIneligibleReason`; `agentExists` comes from `agents.getById(workspaceId, review.agentId)`.
       A reason → `AppError(<code>, msg, 422)`.
    3. An existing case for `(agent, finding)` → return `{status:200, case}`.
    4. A null patch → 422 `patch_missing`.
    5. Build the diff and check its size → 422 `diff_too_large`.
    6. Parse it, then check `rangeIntersectsHunks` → 422 `range_outside_hunks`.
    7. Name the case: `uniqueCaseName(slugifyTitle(title), names)`.
    8. Insert the case with:
       - `expected_output = {kind: accepted? must_find : must_not_flag, file, start_line, end_line}`;
       - `input_meta = {pr_number, title, body}` (copied, so frozen);
       - `labels = {severity, category, title}`;
       - `source_pr_number`, `source_repo`, `source_finding_id`.
    9. If the insert lost a race (undefined), reread → 200.
    10. Return 201.
  - **`updateCase`:** 404 outside the workspace. If `expectation` is set, its `file` must equal the case diff's file
    → else 422 `file_mismatch`. Its range must intersect the case diff's hunks → else 422 `range_outside_hunks`.
    `kind` may change (DR-35).
  - **The other case methods:** `listCases`, `getCase` and `deleteCase`, each with 404 when not found.
  - **`routes.ts`:**
    - `POST /findings/:id/eval-case` → `reply.code(201|200)`. Declare **no body schema**: the client sends none.
      This avoids the null-body 422 trap (`server/INSIGHTS.md:103`).
    - `GET /agents/:id/eval/cases`.
    - `GET /eval/cases/:id`.
    - `PATCH /eval/cases/:id` with `body: EvalCaseUpdate`.
    - `DELETE /eval/cases/:id` → 204.

    All of them take `IdParams` and `getContext`. Compose there:
    `new EvalService({ repo: new EvalRepository(app.container.db), agents: app.container.agentsRepo, parseDiff: parseUnifiedDiff, resolveLlm: (p) => app.container.llm(p) })`.
    `parseUnifiedDiff` is imported by `routes.ts` (ring 4) from `../../adapters/git/diff-parser.js`. Register `eval`
    in `server/src/modules/index.ts`.
  - **`server/test/eval-cases.it.test.ts`** covers AC-9, 10, 11, 12, 14 (update the PR row after creation,
    `input_meta` unchanged), 15, 16 (second → `-2`, third → `-3`), 17 (two POSTs → one row, second 200 same id),
    18–21, 23 (a patch of 200 KB + 1 byte, no row), 24, 41–43 (stored case unchanged after each 422), and AC-103
    for create/get/patch/delete/list:
    - Create a second workspace row and drive the service with that workspace id. Precedent:
      `server/test/agents-versions.it.test.ts:174`.
    - The owning workspace succeeds; the other one gets 404 with the row unchanged.

    Build findings, reviews and PR rows directly with Drizzle. Use `MockLLMProvider`/mocks as in
    `server/test/reviews.it.test.ts`. The test must use `sk_live_xxx`-style placeholders only.
- **Files:** `server/src/modules/eval/service.ts`, `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts`, `server/test/eval-cases.it.test.ts`.
- **Done means:**
  - `pnpm exec vitest run test/eval-cases.it.test.ts` (in `server/`) is green with **0 skipped** — read the
    skipped count (`server/INSIGHTS.md:31`).
  - arch:check stays at baseline: `service.ts` imports neither `platform/container` nor `adapters/`, and
    `routes.ts` imports neither `drizzle-orm` nor `db/schema`.
- **Verify:**
  - `node scripts/verify.mjs server src/modules/eval/service.ts src/modules/eval/routes.ts`
  - from `server/`: `pnpm exec vitest run test/eval-cases.it.test.ts` (needs Docker).
- **Rules that apply:**
  - fastify → schema-first params/body, status via `reply.code`.
  - sec → A01 ownership on every id (IDOR), A08 strict body (no mass assignment).
  - OA §4 → inject ports.
- **Risk:** medium.

### W8 — `eval_case_id` / `eval_ineligible_reason` in the PR reviews response
- **Serves:** AC-25; enables AC-2…AC-5 on the client.
- **Do:**
  - In `modules/reviews/repository/review.repo.ts`, add `evalCaseIdsForFindings(db, findingIds): Promise<Map<findingId, caseId>>`.
    It does a `select id, source_finding_id from eval_cases where source_finding_id in (…)`; the ids came from the
    workspace-scoped `reviewsForPull`. Mirror it on the `ReviewRepository` wrapper in `repository.ts`.
  - In `ReviewService.reviewsForPull` (`service.ts:182-196`), fetch the map once. `agentExists` is whether the
    `names` map has the agent; the map is already built from workspace-scoped `getById`. Pass both to `reviewToDto`.
  - `findingRowToDto(row, evalInfo?)` adds `eval_case_id` and `eval_ineligible_reason` (via `evalIneligibleReason`
    from `../eval/helpers/eligibility.js`) **only when `evalInfo` is passed**. Add the two optional fields to
    `ReviewDtoFinding`.
  - Other callers (accept/dismiss, run result) stay unchanged.
  - Do not touch anything prompt-related in `helpers.ts`.
  - `server/test/reviews-eval-fields.it.test.ts`: `GET /pulls/:id/reviews` carries both fields for
    - a triaged uncased finding (`null`/`null`);
    - an untriaged one (`null`/`not_triaged`);
    - a cased one (`<id>`/`null`);
    - an agent-less review's triaged finding (`not_agent_finding`);
    - a finding whose `reviews.agent_id` points to a deleted agent (`agent_missing`).
- **Files:** `server/src/modules/reviews/repository/review.repo.ts`, `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/service.ts`, `server/src/modules/reviews/helpers.ts`, `server/test/reviews-eval-fields.it.test.ts`.
- **Done means:**
  - The integration test is green with 0 skipped.
  - `server/test/reviews.it.test.ts` and `reviews-helpers.test.ts` are still green.
  - The arch:check count is unchanged (reviews' `Container` debt is not extended).
- **Verify:**
  - `node scripts/verify.mjs server src/modules/reviews/helpers.ts src/modules/reviews/service.ts`
  - from `server/`: `pnpm exec vitest run test/reviews-eval-fields.it.test.ts test/reviews.it.test.ts`
- **Rules that apply:**
  - OA §5 → known debt: do not copy, do not expand.
  - `server/INSIGHTS.md:45` → findings queried only by ids from a scoped read.
- **Risk:** low–medium. This is the hot read path; it adds one query.

### W9 — Suite run: executor, start, reads, stale/boot reaping
- **Serves:** AC-35, AC-46…AC-60, AC-66/AC-74 wiring, AC-76, AC-103 (run endpoints), AC-104, AC-105, NFR-5, NFR-6.
- **Do:**
  - **`run-executor.ts` — store port.** It defines a narrow `EvalRunStore` interface
    (`insertOutcome`, `bumpProgress`, `finishRun`) so the unit test passes an in-memory fake (OA §2: a port
    justified by test substitution).
  - **`run-executor.ts` — `class EvalRunExecutor`.** Constructor deps:
    `{ store: EvalRunStore; parseDiff; now: ()=>number; caseDeadlineMs = CASE_DEADLINE_MS }`.
  - **`run-executor.ts` — `execute({runId, startedAt, cases, config, skillBlocks, llm})`.**
    - It runs cases **sequentially** (`for … of`, awaiting each).
    - Per case:
      1. Parse `input_diff`.
      2. Call `reviewPullRequest` with **only** `systemPrompt`, `model`, `diff`, `llm`, `strategy`, `skills`
         (when non-empty), `prDescription` (when the body is non-null), `task: evalTaskLine(meta)` and
         `sessionId: eval:<runId>:<caseId>`. No `callers`, `repoMap`, `intent`, `specs` or `memory`; nothing
         from `labels` or `expectation` (AC-48, AC-49).
      3. Wrap the call in `withTimeout(…, caseDeadlineMs)`. Also pass a `checkCancelled` that throws once the
         deadline has passed.
      4. On success, `scoreCase(expectation, outcome.review.findings, outcome.dropped.length)`, with cost and duration.
      5. On error, the outcome is `errored`. `error_reason` is `timeout` for a `TimeoutError`; `invalid_output` when
         the error is the engine's structured-output/schema failure (identify the class or code in
         `reviewer-core/src/llm/structured.ts` / `server/src/platform/structured.ts` and assert it in the test);
         otherwise `llm_error`.
      6. Insert the outcome. `case_name`, `kind` and the `expectation` snapshot are frozen.
      7. `bumpProgress`.
    - At the end: `aggregateRun` + `finalStatus`, then `finishRun` with `finished_at` and
      `duration_ms = finished_at − started_at` (AC-76), conditional on `status='running'`.
    - It catches any unexpected error by finishing the run as `failed` (reason `interrupted`) — never an unhandled
      rejection (`server/INSIGHTS.md:18`).
  - **`EvalService.startRun(workspaceId, agentId)`**:
    1. Load the agent → 404.
    2. `failStaleRuns(workspaceId, now − STALE_RUN_MS)`.
    3. If a run is `running` → 409 `run_in_progress`.
    4. List the cases → 0 → 422 `no_cases`.
    5. `resolveLlm(agent.provider)`; a `ConfigError` → 422 `provider_key_missing`.
    6. Resolve the skills: `agents.linkedSkills(agent.id)` → `assembleSkills` from `../reviews/helpers.js` (reused,
       not duplicated; it wraps imported/community bodies). Record only **enabled** skills
       `{name, version}` in order.
    7. `config = {system_prompt, model, provider, strategy, skills}`.
    8. `insertRun` with `agent_version`, `config`, `case_ids` and `cases_total`; `'conflict'` → 409.
    9. Snapshot the cases (diff, meta, expectation, name) **in memory**, start `executor.execute(...)` without
       awaiting it, and return `{run_id, status:'running', cases_total}` together with an internal `done` promise
       for tests. Routes drop `done`.
  - **Reads:**
    - `listRuns(agentId)` (≤20, newest first) and `getRun(runId)` (with outcomes) — both call `failStaleRuns` first.
    - `listCases`/`getCase` attach `last_outcome` from `latestOutcomesForCases`.
  - **Routes:** `POST /agents/:id/eval/runs` → 202 (no body schema), `GET /agents/:id/eval/runs`, `GET /eval/runs/:id`.
  - **Boot:** in `server/src/app.ts`, right after the agent-runs reaper (`:80-85`), call
    `new EvalRepository(container.db).failAllRunning()` in its own try/catch, logging at info/warn.
  - **`server/test/eval-executor.test.ts`** (unit, fake store, spy/stub LLM):
    - the captured prompt has no "Project context"/callers/repo-map/intent sections (assert the
      `outcome.assembly` slots or message text) (AC-48);
    - a sentinel in labels/expectation is absent from every prompt (AC-49);
    - at most 1 call in flight over 3 cases (AC-50);
    - fail on case 2 of 3 → scored · errored · scored (AC-54);
    - fake timers + a never-settling stub → `errored: timeout`, and the next case runs (AC-55);
    - always failing → `failed: all_cases_errored` (AC-57);
    - the diff sits inside `<untrusted source="diff">`, an injected `</untrusted>` is escaped, and an
      `imported_url` skill body is wrapped (NFR-5);
    - a counting stub sees exactly N `completeStructured` calls for N single-file cases, with no other model
      requested (NFR-6, AC-74).
  - **`server/test/eval-runs.it.test.ts`**, via the app with injected `llm` overrides:
    - AC-46: a deferred stub that never resolves until the test ends → 202, row `running`, `cases_total` = count.
      Resolve the deferred in `afterEach`.
    - AC-47: edit the agent prompt after start; the run config and version are unchanged.
    - AC-51: second start → 409, one row. AC-52. AC-53 (a secrets override with no key, no llm override).
    - AC-56 and AC-76.
    - AC-58: a row with `started_at` 16 min ago → `failed: interrupted` on GET. A `running` row present before
      `buildApp` → failed.
    - AC-59: `cases_done` increases between stubbed cases (deferred per case).
    - AC-60: start, never poll; await `done` (or poll the DB) → `completed`.
    - AC-35: the GET run JSON for a case's outcome is deep-equal before/after a PATCH and a DELETE of the case.
    - AC-104: `DELETE /agents/:id` → no case or run rows remain.
    - AC-105: `DELETE /reviews/:id` → the case still runs to `completed`, and `source.available === false`.
    - AC-103 for start/get/list.
- **Files:** `server/src/modules/eval/run-executor.ts`, `server/src/modules/eval/service.ts`, `server/src/modules/eval/routes.ts`, `server/src/app.ts`, `server/test/eval-executor.test.ts`, `server/test/eval-runs.it.test.ts`.
- **Done means:**
  - Both tests are green, the integration test with 0 skipped.
  - arch:check is at baseline: `run-executor.ts` imports no `adapters/` and no `platform/container`.
  - Grep confirms the executor never references `labels` or `source` when building `reviewPullRequest` input.
- **Verify:**
  - `node scripts/verify.mjs server test/eval-executor.test.ts src/modules/eval/service.ts src/app.ts`
  - from `server/`: `pnpm exec vitest run test/eval-runs.it.test.ts`
- **Rules that apply:**
  - `server/INSIGHTS.md:11`, `:82` → our own deadline, not the provider's `timeoutMs`.
  - `:51` → reuse `renderSkillBlock` wrapping.
  - OA §4.
  - sec → ASI01 (untrusted text stays inside the delimiters), A01.
  - fastify → 202 via `reply.code`.
- **Risk:** high. Background work, timers and races. See Spec follow-ups 2–3.

### W10 — Compare, overview, dashboard endpoints
- **Serves:** AC-79 (server), AC-82/AC-84 (data), AC-85 (wiring), AC-90…AC-97, AC-103 (compare/overview/detail).
- **Do:**
  - **`EvalService.compare(workspaceId, a, b)`**, in order:
    1. Load both runs, scoped → 404.
    2. Same id → 422 `same_run`.
    3. Different `agent_id` → 422 `different_agents`.
    4. Either not `completed` → 409 `run_not_completed`.
    5. `orderRuns`, then `compareRuns` + `promptLineDiff(old.config.system_prompt, new.config.system_prompt)`.
       `old`/`new` are serialised **without** outcomes.
  - **`overview(workspaceId)`:** one row per workspace agent (`agents.list` order) with `cases_total` and
    `latest_run` = newest run of any status, or null (Assumption A5).
  - **`dashboard(workspaceId, agentId)`:**
    - 404 outside the workspace;
    - `runs` ≤20 newest first;
    - `trend` = completed runs among those, chronological;
    - `alert = regressionAlert(...)`.
  - **Routes:** `GET /eval/compare?a=&b=` (querystring `z.object({a: uuid, b: uuid})`), `GET /eval/overview`,
    `GET /agents/:id/eval/dashboard`.
  - **`server/test/eval-compare.it.test.ts`:**
    - AC-91: runs over {1,2,3} and {2,3,4} → compared on {2,3}, `only_in_old`=[1], `only_in_new`=[4].
      Insert run and outcome rows directly.
    - AC-95/96/97 status + reason.
    - AC-79: the overview holds every workspace agent, including one with zero cases.
    - The dashboard returns `alert` on a seeded 0.06 precision drop.
    - AC-103 for compare/overview/detail (the other workspace gets 404 or never sees the rows).
- **Files:** `server/src/modules/eval/service.ts`, `server/src/modules/eval/routes.ts`, `server/test/eval-compare.it.test.ts`.
- **Done means:** the test is green with 0 skipped, and arch:check is at baseline.
- **Verify:**
  - `node scripts/verify.mjs server src/modules/eval/service.ts`
  - from `server/`: `pnpm exec vitest run test/eval-compare.it.test.ts`
- **Rules that apply:** fastify → querystring schema. sec → A01 (both ids scoped).
- **Risk:** low.

### W11 — Seed the demo PR, triaged findings and ≥8 cases
- **Serves:** AC-106…AC-109, NFR-1 (placeholder), AC-113 (makes the live experiment possible).
- **Do:**
  - **`server/src/db/seed-eval.ts`** (plain data plus one 3-line `caseDiff(path, patch)` string builder,
    duplicated from `buildCaseDiff` on purpose: `src/db` may not import `src/modules`). It holds:
    - PR **#483** "Add payment webhooks and admin export" in `acme/payments-api`;
    - **3 files** with real multi-hunk unified patches: `src/api/webhooks.ts`, `src/admin/export.ts`,
      `src/lib/crypto.ts`. Any secret-shaped literal is `sk_live_xxx` only (`server/INSIGHTS.md:104`);
    - **11 findings** for a Security Reviewer review, each with its line range on new-side hunk lines:
      - 5 accepted, of which 4 cased `must_find`;
      - 5 dismissed, of which 4 cased `must_not_flag`;
      - 1 untriaged;
      - so 2 triaged findings are uncased.
    - The `must_not_flag` ranges sit on benign changed lines (logging, renames, comments). A "flag every changed
      line" prompt then hits them, which is the setup for AC-113.
    - Literal case names = the kebab slugs of their titles, unique.
  - **`seed.ts`:** a new block **after** the agents loop (`seed.ts:279-285`).
    1. Look up the Security Reviewer by name. If PR #483 is absent:
       - insert the PR, `pr_files` and one commit;
       - insert the review with `agentId` = Security Reviewer, `kind:'review'`, `model:'seed'`;
       - insert the findings with `acceptedAt`/`dismissedAt`.
    2. Then, outside the `if` (still idempotent), for each planned case: find its finding by `(review_id, file,
       start_line, title)` and insert the case row with `.onConflictDoNothing()` on `(agent_id, source_finding_id)`.
       The row carries `workspaceId`, `agentId`, `name`, `inputDiff: caseDiff(...)`,
       `inputMeta {pr_number:483, title, body}`, `expectedOutput {kind,file,start_line,end_line}`,
       `labels`, `sourceFindingId`, `sourcePrNumber: 483`, `sourceRepo: 'acme/payments-api'`.
    3. Update the header comment ("eval … start empty") to say eval is seeded.
  - **`server/test/eval-seed.it.test.ts`:** seed an empty DB, then assert:
    - AC-106: the review has ≥10 findings, each passing `rangeIntersectsHunks(parseUnifiedDiff(caseDiff), …)`
      against its file's patch;
    - AC-107: ≥8 cases for the Security Reviewer, ≥3 `must_not_flag`, ≥1 `must_find`, each linked to a finding of
      that review. Each `input_diff === buildCaseDiff(file, patch)` and each `name === slugifyTitle(title)`
      (guards the duplication);
    - AC-108: ≥2 triaged findings with no case;
    - AC-109: a second `seed()` leaves the PR/finding/case counts unchanged.
- **Files:** `server/src/db/seed-eval.ts`, `server/src/db/seed.ts`, `server/test/eval-seed.it.test.ts`.
- **Done means:**
  - The test is green with 0 skipped, and arch:check is at baseline (no `db-not-to-modules` error).
  - `grep -rnE "sk_live_[0-9A-Za-z]{20,}" server/src/db` finds nothing.
  - `pnpm db:seed` on the dev DB prints `✓ seeded`.
- **Verify:**
  - `node scripts/verify.mjs server src/db/seed.ts`
  - from `server/`: `pnpm exec vitest run test/eval-seed.it.test.ts`
- **Rules that apply:**
  - `server/INSIGHTS.md:57` → seed is part of delivery.
  - `:104` → `sk_live_xxx` only.
  - `:34` → never edit the #482 block, use a new PR.
- **Risk:** medium (seed order, idempotency).

### W12 — `pnpm verify:l06`, the AC-112 experiment test, the fixture secret scan
- **Serves:** AC-110, AC-111, AC-112, NFR-1.
- **Do:**
  - **`server/test/eval-experiment.it.test.ts`** (AC-112):
    - Use a stub `LLMProvider` keyed on the system prompt. Prompt A returns a finding matching a `must_find` case.
      Prompt B returns one overlapping a `must_not_flag` case.
    - Run once with A, PATCH the agent prompt to B, run again, then `GET /eval/compare`.
    - Assert `deltas.recall !== 0 || deltas.precision !== 0`.
  - **`server/test/eval-fixtures-secrets.test.ts`** (NFR-1): read `src/db/seed.ts`, `src/db/seed-eval.ts`,
    `src/db/seed-pulls.ts` and every `test/eval-*.ts` source. Assert no match for `/sk_live_[0-9A-Za-z]{20,}/`.
  - **`server/package.json` script:**
    ```
    "verify:l06": "vitest run test/eval-case-diff.test.ts test/eval-scoring.test.ts test/eval-compare.test.ts test/eval-executor.test.ts test/eval-contracts.test.ts test/contracts.test.ts test/eval-fixtures-secrets.test.ts test/eval-cases.it.test.ts test/eval-runs.it.test.ts test/eval-compare.it.test.ts test/eval-seed.it.test.ts test/eval-experiment.it.test.ts test/reviews-eval-fields.it.test.ts"
    ```
    vitest's summary prints `Tests N passed | M skipped`. That is what AC-111 reads when the `.it` files
    `describe.skip` without Docker.
- **Files:** `server/package.json`, `server/test/eval-experiment.it.test.ts`, `server/test/eval-fixtures-secrets.test.ts`.
- **Done means:**
  - `cd server && pnpm verify:l06` exits 0 with Docker up, and the summary shows **0 skipped**.
  - With Docker stopped, it exits 0 and the `Tests` line shows a non-zero `skipped` count.

  Both are run and reported by the executor with the two summary lines quoted.
- **Verify:** `cd server && pnpm verify:l06`
- **Rules that apply:**
  - sec (`**/package.json`) → the script runs only vitest, with no shell interpolation.
  - `server/INSIGHTS.md:91` → do not use `verify.mjs --it` with file args.
- **Risk:** low.

### W13 — Client foundations: hooks, eval domain module, i18n, Modal Escape
- **Serves:** AC-6/7/8 (hook), AC-30 & AC-77 (formatters), AC-39 (validator), AC-61/64 (polling, error mapping), AC-86 (alert text), NFR-2, NFR-3 (Escape); enables W14–W20.
- **Do:**
  - **`client/src/lib/hooks/eval.ts`:**
    - **Queries:**
      - `useEvalCases(agentId)` → `["eval-cases", agentId]`;
      - `useEvalRuns(agentId)` → `["eval-runs", agentId]`, with `refetchInterval` 3000 while any run is `running`;
      - `useEvalRun(runId)`;
      - `useEvalOverview()`;
      - `useEvalDashboard(agentId)` (polls while its runs contain a running one);
      - `useEvalCompare(a, b)` (enabled only with both ids).
    - **Mutations:**
      - `useCreateEvalCase(prId)`: `POST /findings/:id/eval-case`, `meta:{quietError:true}`. Its `onError` maps a
        422 `code` via `CREATE_CASE_ERROR_KEY` → `notify.error(t(...))`, falling back to `errors.generic`. Its
        `onSuccess` writes `eval_case_id` into the cached `["reviews", prId]` finding (`setQueryData`) and then
        invalidates.
      - `useUpdateEvalCase(agentId)` (PATCH).
      - `useDeleteEvalCase(agentId)` (invalidates cases).
      - `useStartEvalRun(agentId)`: `meta:{quietError:true}`; 409/422/429 → one mapped toast via `RUN_START_ERROR_KEY`
        (429 → `errors.rateLimited`); `onSuccess` invalidates runs, dashboard and overview.

    All calls go through `api` (`client/src/lib/api.ts:110`). The hook takes a translator, or uses
    `useTranslations` inside the hook body.
  - **`client/src/lib/eval.ts`:**
    - `formatMetric(v)` → `"n/a"` for null, else `${Math.round(v*100)}%` (0.8249 → "82%").
    - `deltaPoints(newV, oldV)` → whole points or null.
    - `resultLineParts(outcome, expectation)` → one of `mustFind` / `mustNotFlag` / `errored` / `never`, with values.
    - `parseExpectationText(text)` → `JSON.parse` in try/catch, then `EvalExpectation.safeParse`.
      This is a **value import** from `@devdigest/shared`.
    - `CREATE_CASE_ERROR_KEY` and `RUN_START_ERROR_KEY` maps.
    - `alertDropText` params (metric label, pts, versions).
  - **`client/src/lib/eval.test.ts`:**
    - the AC-77 triple (`formatMetric(null) === "n/a"`, 0.8249 → "82%"; null cost relies on `formatCost` → "—");
    - every result-line variant;
    - valid/invalid/missing-`file` expectation;
    - every reason code maps to a key that exists in `messages/en/*.json` (load the JSON in the test) — AC-8.
  - **`client/messages/en/eval.json`:** rewrite it with keys for every eval screen. Mandatory English strings,
    verbatim from the spec:
    - "No runs yet", "k / N passing" (`{passed} / {scored} passing`);
    - "Run all evals ({count} cases)", "Run eval ({count} cases)", "Running {done} / {total} cases";
    - "expected a finding at {loc}, got {n}", "expected none at {loc}, got {n}", "errored · {reason}", "never run";
    - "must find", "must not flag", "Run history", "View full dashboard →";
    - "Eval case · {name}", "{agent} · simulate a PR and assert the expected output";
    - "valid JSON", "invalid JSON";
    - "Last run passed · {line} · {seconds}s · {cost}", "Last run failed · …", "Last run errored · {reason}", "Never run";
    - "PR #{n} · {file}:{start}–{end}", "source removed";
    - "Eval Dashboard", "0 cases · never run", "All agents";
    - "Regression harness · {runs} runs on the {cases}-case set", "Configure eval cases →";
    - "{metric} dropped {pts} pts on v{new} vs v{old}";
    - "{count} selected", "Compare", "Compare runs · v{old} → v{new}";
    - "SYSTEM PROMPT DIFF", "v{v} (old)", "v{v} (new)", "No changes", "Close";
    - the metric labels RECALL / PRECISION / CITATION ACCURACY / CASES PASSED / CITATION / COST;
    - table headers, the empty-state text, the delete-confirm copy;
    - an `errors.*` entry for each run-start / compare / update code, plus `rateLimited` and `generic`.
  - **`client/messages/en/prReview.json`:** `finding.evalCase.{turnInto:"Turn into eval case", inSuite:"In eval suite", agentMissing:"Agent no longer exists", errors.<6 codes>}`.
  - **`client/src/vendor/ui/kit/Modal.tsx`:** when `onClose` is set, a `keydown` listener on `document` calls it on
    `Escape`. It is added in `useEffect` with cleanup.
- **Files:** `client/src/lib/hooks/eval.ts`, `client/src/lib/eval.ts`, `client/src/lib/eval.test.ts`, `client/messages/en/eval.json`, `client/messages/en/prReview.json`, `client/src/vendor/ui/kit/Modal.tsx`.
- **Done means:**
  - `eval.test.ts` is green.
  - `grep -rn 'useTranslations("eval")' client/src` finds no consumer of a key that was removed (none exist today).
  - The existing modal tests (`ConfirmDialog`, `SkillDraftModal`, `CreateSkillModal`) are still green.
  - Client typecheck is green.
- **Verify:** `node scripts/verify.mjs client src/lib/eval.test.ts src/vendor/ui/kit/Modal.tsx src/lib/hooks/eval.ts`
- **Rules that apply:**
  - FUA §5 → server data only through `lib/hooks`.
  - `client/INSIGHTS.md:144` → `quietError` + one toast.
  - `:143` → a value import needs a build (at integration).
  - zod → `parse-use-safeparse`, `parse-never-trust-json`.
- **Risk:** medium. The i18n key list is the contract for L7/L8: they may not edit `eval.json` and must report a
  missing key instead.

### W14 — FindingCard "Turn into eval case" action
- **Serves:** AC-1…AC-8, NFR-2, NFR-3, NFR-4.
- **Do:**
  - Add `…/FindingCard/_components/EvalCaseAction/EvalCaseAction.tsx`, rendered inside `s.actions` **after** the
    Dismiss button. Its props are `{ finding: FindingRecord; agentId: string | null; prId?: string }`.
  - What it renders, by state:
    - `eval_ineligible_reason` `not_triaged`/`not_agent_finding` → nothing.
    - `agent_missing` → a disabled ghost `Button icon="FlaskConical"`, wrapped in an element with
      `title={t("finding.evalCase.agentMissing")}`. A disabled button gets no hover events, so put the tooltip on
      the wrapper.
    - `eval_case_id` (or the mutation result's id) → "In eval suite". Clicking it runs
      `router.push(\`/agents/${agentId ?? created.agent_id}?tab=evals&case=${caseId}\`)`.
    - Otherwise → a ghost button "Turn into eval case", disabled while `create.isPending`.
  - `FindingCard` gains an optional `agentId` and passes it down. `FindingsPanel` gains `agentId?: string | null`.
    `ReviewRunAccordion` passes `review.agent_id`.
  - Tests in `EvalCaseAction.test.tsx`, plus one assertion in `FindingCard.test.tsx` for the order after Dismiss:
    - the button exists for accepted and for dismissed findings;
    - none for untriaged or `not_agent_finding`;
    - disabled + tooltip text;
    - a double `fireEvent.click` → `fetch` called once;
    - a mocked 201 → label "In eval suite";
    - a mocked 422 per code → exactly one toast with the mapped English text, and no raw code;
    - "In eval suite" click → router push to `/agents/a1?tab=evals&case=c1` (mock `next/navigation`);
    - a title `<img src=x onerror=…>` renders as literal text (no `img` element) — NFR-4.
- **Files:** `…/FindingCard/FindingCard.tsx`, `…/FindingCard/FindingCard.test.tsx`, `…/FindingCard/_components/EvalCaseAction/{EvalCaseAction.tsx,index.ts,styles.ts,EvalCaseAction.test.tsx}`, `…/FindingsPanel/FindingsPanel.tsx`, `…/ReviewRunAccordion/ReviewRunAccordion.tsx`.
- **Done means:** the listed tests are green; `FindingsPanel.test.tsx` still passes; no hex/`rgb(` literal in the new files.
- **Verify:** `node scripts/verify.mjs client "src/app/repos/[repoId]/pulls/[number]/_components/FindingCard" "src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx"`
- **Rules that apply:**
  - FUA §1 → a child used only by FindingCard lives in its `_components`.
  - react → no `{count && …}`.
  - RTL → query by role/name, scope with `within` (`client/INSIGHTS.md:176-177`).
  - sec → text only, no `dangerouslySetInnerHTML`.
- **Risk:** low.

### W15 — Shared `EvalRunButton`
- **Serves:** AC-61, AC-62, AC-63, AC-64.
- **Do:**
  - Add `client/src/components/EvalRunButton/EvalRunButton.tsx` with props
    `{ agentId: string; caseCount: number; variant: "tab" | "dashboard"; runningRun?: EvalSuiteRun | null }`.
  - The label is "Run all evals (N cases)" for the tab and "Run eval (N cases)" for the dashboard.
  - While `runningRun` is set it shows "Running k / N cases" and is disabled. It is also disabled when
    `caseCount === 0`.
  - The click calls `useStartEvalRun(agentId)`.
  - Use `Button` (`kind="primary"`/`"secondary"`, `icon="Play"`) from `@devdigest/ui`.
  - The test, with fetch mocked:
    - both labels carry the count; zero cases → disabled;
    - a running run renders "Running 2 / 8 cases" and disabled, and re-rendering with `cases_done: 3` shows 3;
    - 409, 422 `no_cases` and 429 each → exactly one toast with mapped text.
- **Files:** `client/src/components/EvalRunButton/{EvalRunButton.tsx,index.ts,styles.ts,EvalRunButton.test.tsx}`.
- **Done means:** the test is green, and `index.ts` exports only the component.
- **Verify:** `node scripts/verify.mjs client src/components/EvalRunButton`
- **Rules that apply:** FUA §1 → two routes consume it, so `src/components`, with a narrow barrel.
- **Risk:** low.

### W16 — Agent Editor Evals tab (metrics, case list, run history, delete)
- **Serves:** AC-5 (open via `?case=`), AC-26…AC-34, AC-61/62 (placement), AC-77 (display), NFR-3, NFR-4.
- **Do:**
  - **Tab wiring:** in `AgentEditor/constants.ts`, append `{key:"evals", labelKey:"editor.tabs.evals", icon:"FlaskConical"}`
    after `context`. In `AgentEditor.tsx`, render `<EvalsTab key={agent.id} agent={agent} />` when `tab === "evals"`.
  - **`EvalsTab` header:** "Eval cases" + the `Badge` "k / N passing" for the latest completed run
    (`cases_passed`/`cases_scored`) + `<EvalRunButton variant="tab">`.
  - **Metrics:** four `MetricCard`s (RECALL, PRECISION, CITATION ACCURACY, CASES PASSED `k/N`). Each passes
    `delta` = `deltaPoints` vs the previous completed run (Assumption A6). "No runs yet" when there is no
    completed run.
  - **Case list:** `EvalCaseRow` (`_components/EvalCaseRow/`) composes the mock `components2.jsx:47-60`:
    - the status icon `CheckCircle`/`XCircle`/`AlertTriangle`/`Dot` in token colours;
    - a mono name;
    - the result line (`resultLineParts` + i18n);
    - a kind `Badge`;
    - the severity · category chip (`SeverityBadge` compact + `CategoryTag`);
    - `IconBtn` Edit and Delete (danger) — **no Run**.

    Row click / Edit → open `EvalCaseModal` (W17); the selected case lives in the URL `?case=<id>`, so AC-5 lands
    with it open. Delete → `ConfirmDialog` → `useDeleteEvalCase`.
  - **Empty suite:** an `EmptyState` with the copy from W13.
  - **`RunHistory`** (`_components/RunHistory/`): the last 5 runs, newest first. Columns: ran at · version ·
    recall · precision · citation · pass · cost (`formatCost`) · status. The link "View full dashboard →" goes to
    `/eval/<agentId>`.
  - **Tests:**
    - `AgentEditor.test.tsx`: the tab order Config, Skills, Context, Evals, and `tab="evals"` renders the Evals tab.
    - `EvalsTab.test.tsx`:
      - four cards with values and deltas from mocked runs;
      - "No runs yet";
      - a row per case with its parts and no element labelled "Run" inside rows;
      - the four result-line variants;
      - "5 / 7 passing" from 7 scored, 5 passed, 1 errored;
      - EmptyState;
      - 7 runs → 5 rows in order, and the link target;
      - Delete → dialog → confirm → DELETE issued and the row gone;
      - `?case=c1` opens the modal;
      - an `<img onerror>` case name renders literally.
- **Files:** `AgentEditor/constants.ts`, `AgentEditor/AgentEditor.tsx`, `AgentEditor/AgentEditor.test.tsx`, `AgentEditor/_components/EvalsTab/{EvalsTab.tsx,helpers.ts,styles.ts,index.ts,EvalsTab.test.tsx}`, `EvalsTab/_components/EvalCaseRow/*`, `EvalsTab/_components/RunHistory/*`.
- **Done means:**
  - The tests are green.
  - `grep -nE "#[0-9a-fA-F]{3,6}\b|rgb\(" ` over the new files finds nothing.
  - The `?case=` param is read with `useSearchParams` inside a client component of the dynamic `/agents/[id]` route.
- **Verify:** `node scripts/verify.mjs client "src/app/agents/[id]/_components/AgentEditor"`
- **Rules that apply:**
  - FUA §5 → URL state for the open case.
  - react → derive, don't store.
  - `client/INSIGHTS.md:174` → the em-dash collision in tests.
- **Risk:** medium (size). Split into more `_components` if `EvalsTab.tsx` exceeds about 200 lines.

### W17 — Edit-only Eval Case modal
- **Serves:** AC-36…AC-40, AC-44, AC-45, NFR-3, NFR-4.
- **Do:**
  - Add `EvalsTab/_components/EvalCaseModal/EvalCaseModal.tsx`: a `Modal width={920}` with
    title "Eval case · {name}" and subtitle "{agent} · simulate a PR and assert the expected output".
  - Body:
    - a Name `TextInput`, with the field held as a nullable override over the case (`client/INSIGHTS.md:135`);
    - a Notes `Textarea`;
    - "Input" `Tabs` with **Diff | PR meta** (no Files):
      - Diff: a read-only `<pre>` where each line is a span; `+` → `var(--code-add)` background, `-` →
        `var(--code-del)`, `@@` → `color: var(--accent-text)` (mock `screen_cizruns.jsx:75`);
      - PR meta: plain text for number, title and body. No inputs.
    - an "Expected output" mono `Textarea` holding `JSON.stringify(expectation, null, 2)`, with a `Badge`
      "valid JSON"/"invalid JSON" from `parseExpectationText`;
    - the "Last run" line variants (`formatCost`; null → "—");
    - the source line or "source removed".
  - Footer: Cancel and Save. Save is disabled when the JSON is invalid or the name is blank. It sends only changed
    fields via `useUpdateEvalCase`.
  - The test covers:
    - all parts present; absent "Files", "Run case", "Run on save", "Finding skeleton";
    - no `input`/`textarea` inside either Input tab;
    - line spans carry the token styles;
    - malformed JSON and missing `file` → "invalid JSON" with Save disabled; valid → "valid JSON" with Save enabled;
    - the four last-run variants (null cost "—");
    - both source variants;
    - Escape (`fireEvent.keyDown(document, {key:"Escape"})`) calls `onClose`;
    - an `<img onerror>` diff line / PR title / body renders literally.
- **Files:** `EvalsTab/_components/EvalCaseModal/{EvalCaseModal.tsx,helpers.ts,styles.ts,index.ts,EvalCaseModal.test.tsx}`.
- **Done means:** the test is green, and there are no hex/`rgb(` literals.
- **Verify:** `node scripts/verify.mjs client "src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/EvalCaseModal"`
- **Rules that apply:**
  - FUA §7 → `styles.ts` with token colours, no shorthand/longhand mixing.
  - RTL → `toHaveValue` for multi-line textareas (`client/INSIGHTS.md:175`).
  - sec → text rendering only.
- **Risk:** low.

### W18 — Sidebar entry + `/eval` overview
- **Serves:** AC-78, AC-79 (client), AC-80 (row navigation), NFR-2/4.
- **Do:**
  - **Nav:** in `client/src/vendor/ui/nav.ts`, add `{ key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval" }`
    to SKILLS LAB, after `skills` (`chrome.jsx:13`).
  - **Page:** add `client/src/app/eval/page.tsx`, a thin `"use client"` page in `AppShell` with the crumb
    Skills Lab / Eval Dashboard. It renders `_components/EvalOverview`.
  - **`EvalOverview` rows:** each row shows the agent name, a model `Badge`, the case count and the latest run's
    version, recall, precision, citation (`formatMetric`), pass `k/N`, cost (`formatCost`) and ran-at. A
    zero-case row shows "0 cases · never run" linking to `/agents/<id>?tab=evals`. A row click goes to
    `/eval/<agentId>`.
  - **Tests:**
    - Extend the existing app-shell helpers test (or add one) so `activeKeyFor("/eval/abc") === "eval"`, and assert
      `NAV` contains the item.
    - `EvalOverview.test.tsx`: the fields render; the zero-case row text and link; a row click navigates to
      `/eval/a1`; a hostile agent name renders literally.
- **Files:** `client/src/vendor/ui/nav.ts`, `client/src/app/eval/page.tsx`, `client/src/app/eval/_components/EvalOverview/{EvalOverview.tsx,styles.ts,index.ts,EvalOverview.test.tsx}`, the app-shell helpers test.
- **Done means:**
  - The tests are green.
  - `page.tsx` does not call `useSearchParams` (static route; the build would demand a Suspense boundary).
- **Verify:** `node scripts/verify.mjs client src/app/eval/_components/EvalOverview src/components/app-shell`
- **Rules that apply:**
  - FUA §6 → `"use client"` at the top of the subtree; pages are thin.
  - `client/INSIGHTS.md:157` → the shell is pre-wired.
- **Risk:** low.

### W19 — `/eval/[agentId]` detail: cards, trend, runs table, banner, selection
- **Serves:** AC-61/62 (placement), AC-80 (reload), AC-81…AC-84, AC-86…AC-89, NFR-3, NFR-4.
- **Do:**
  - **Page:** add `client/src/app/eval/[agentId]/page.tsx` → `_components/EvalAgentDetail`, a composition of
    `screen_skills.jsx:279-325`:
    - **Header:**
      - an "All agents" back link → `/eval`;
      - the agent name + model `Badge`;
      - the subtitle "Regression harness · R runs on the N-case set";
      - `MonoLink` "Configure eval cases →" → `/agents/<id>?tab=evals`;
      - `<EvalRunButton variant="dashboard">`.
    - **`RegressionBanner`:** shown when `alert` exists, with `--warn` border, `--warn-bg` and `AlertTriangle`.
      It renders one sentence per drop ("Precision dropped 6 pts on v8 vs v7") and lists the `now_failing` names.
    - **Metric cards:** three `MetricCard`s, each with `delta` in points and `trend` = the last ≤20 completed values
      (null → skipped).
    - **Trend chart:** `LineChart` with **`yMin={0}` `yMax={1}`**, and legend dots in the mock colours.
    - **`RunsTable`:** the last 20 runs, newest first. Columns ☐ · Ran at · Version · Recall · Precision · Citation
      · Pass · Cost. `MiniBar` (`_components/MiniBar/`) is a token-coloured bar + value.
  - **Selection:** state for the selected ids (max 2).
    - A checkbox is disabled when the run is not `completed`, or when 2 are selected and it is not one of them.
    - "{count} selected" + a `Compare` button enabled only at exactly 2. It opens `CompareRunsModal` (W20).
  - **`vendor/ui/kit/Checkbox.tsx`:** add `disabled?: boolean` (sets `disabled` + `aria-disabled` on the button,
    muted style) and `ariaLabel?: string`.
  - **Tests:**
    - the header parts and the link target;
    - cards with the mocked values, deltas and trend arrays;
    - the chart receives a 0–1 domain, so a 0.30 precision lies within it (assert the props via the rendered
      `YAxis` ticks, or spy on the `LineChart` props);
    - 25 runs → 20 rows in order;
    - the banner text "Precision dropped 6 pts on v8 vs v7" and the failing names;
    - 0/1/2 selections and Compare enabled only at 2;
    - a third checkbox disabled; running and failed rows disabled;
    - Space on a focused checkbox toggles it (`fireEvent.keyDown`/click on the native button);
    - rendering the page with `agentId=a1` shows the same agent (AC-80);
    - hostile case names in the banner render literally.
- **Files:** `client/src/app/eval/[agentId]/page.tsx`, `client/src/app/eval/[agentId]/_components/EvalAgentDetail/{EvalAgentDetail.tsx,helpers.ts,styles.ts,index.ts,EvalAgentDetail.test.tsx}`, `…/_components/{RegressionBanner,RunsTable,MiniBar}/*`, `client/src/vendor/ui/kit/Checkbox.tsx`.
- **Done means:** the tests are green; existing Checkbox consumers' tests are still green; there are no hex/`rgb(` literals in the new files.
- **Verify:** `node scripts/verify.mjs client "src/app/eval/[agentId]" src/vendor/ui/kit/Checkbox.tsx`
- **Rules that apply:**
  - FUA §3 → split by job (banner, table, bar).
  - react → derive, don't store; never use an index as a key.
  - FUA §7 → tokens only.
- **Risk:** medium.

### W20 — Compare runs modal
- **Serves:** AC-98…AC-102, AC-113 (the view the screenshot is taken of), NFR-3, NFR-4.
- **Do:**
  - Add `EvalAgentDetail/_components/CompareRunsModal/CompareRunsModal.tsx`. It fetches `useEvalCompare(a,b)` and
    renders a `Modal` titled "Compare runs · v{old} → v{new}".
  - Four cards: RECALL, PRECISION and CITATION as `old% → new%` with ▲/▼ (`Icon.ArrowUp`/`ArrowDown`) and the
    delta in whole points; COST as `formatCost(old) → formatCost(new)` with ▲/▼ and the `$` delta.
  - "SYSTEM PROMPT DIFF" with a legend v{old} (old) / v{new} (new). `added` lines are on `var(--code-add)` and
    `removed` lines on `var(--code-del)`. When every line is `context`, show "No changes".
  - Lists: config changes as `field: old → new`, the flips ("now passing"/"now failing"), and only-in-old /
    only-in-new.
  - The footer is **only** `Close`.
  - The test, from a mocked compare response:
    - the title and four cards; token styles on added/removed lines; "No changes";
    - each list renders;
    - no "Promote" button;
    - Escape closes the modal;
    - a prompt-diff line `<img src=x onerror=…>` renders as text.
- **Files:** `…/EvalAgentDetail/_components/CompareRunsModal/{CompareRunsModal.tsx,styles.ts,index.ts,CompareRunsModal.test.tsx}`.
- **Done means:** the test is green, and there are no hex/`rgb(` literals.
- **Verify:** `node scripts/verify.mjs client "src/app/eval/[agentId]/_components/EvalAgentDetail/_components/CompareRunsModal"`
- **Rules that apply:** FUA → compose existing primitives (`Modal`, `Card`, `Badge`, `SectionLabel`, `Button`). sec → text only.
- **Risk:** low.

---

## Execution

Each executor is dispatched with this plan's path **and its lane id**, and touches only its lane's files.
Every lane is one package (L1 is the one exception: the lock-step vendor pair) and holds 2–3 items.

| Lane | Executor | Work items | Files (disjoint) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| L1 — contracts + schema | implementer | W1, W2 | both `vendor/shared/contracts/{eval-ci,knowledge,review-api}.ts`; `server/test/contracts.test.ts`, `server/test/eval-contracts.test.ts`; `server/src/db/{schema/eval.ts,schema.ts,rows.ts}`, migrations 0019/0020 | — | — | **runs alone** (`pnpm db:generate` rewrites `migrations/meta`) |
| L2 — server core | implementer | W3, W4, W5 | `server/src/modules/eval/{constants.ts,helpers/case-diff.ts,helpers/eligibility.ts,helpers/prompt.ts,helpers/scoring.ts,helpers/compare.ts,helpers/alert.ts}`, `server/test/eval-{case-diff,scoring,compare}.test.ts` | L1 | L6, L7, L8 | shared tree |
| L3 — server cases | implementer | W6, W7, W8 | `server/src/modules/eval/{repository.ts,helpers/dto.ts,service.ts,routes.ts}`, `server/src/modules/index.ts`, `server/src/modules/reviews/{helpers.ts,service.ts,repository.ts,repository/review.repo.ts}`, `server/test/{eval-cases,reviews-eval-fields}.it.test.ts` | L2 | L6, L7, L8 | shared tree |
| L4 — server runs + compare | implementer | W9, W10 | `server/src/modules/eval/{run-executor.ts,service.ts,routes.ts}`, `server/src/app.ts`, `server/test/eval-executor.test.ts`, `server/test/eval-{runs,compare}.it.test.ts` | L3 | L6, L7, L8 | shared tree |
| L5 — server seed + verify | implementer | W11, W12 | `server/src/db/{seed.ts,seed-eval.ts}`, `server/package.json`, `server/test/eval-{seed,experiment}.it.test.ts`, `server/test/eval-fixtures-secrets.test.ts` | L4 | L7, L8 | shared tree |
| L6 — client foundations | implementer | W13, W14, W15 | `client/src/lib/{eval.ts,eval.test.ts,hooks/eval.ts}`, `client/messages/en/{eval,prReview}.json`, `client/src/vendor/ui/kit/Modal.tsx`, `…/FindingCard/**`, `…/FindingsPanel/FindingsPanel.tsx`, `…/ReviewRunAccordion/ReviewRunAccordion.tsx`, `client/src/components/EvalRunButton/**` | L1 | L2, L3, L4 | shared tree |
| L7 — client Evals tab | implementer | W16, W17 | `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,AgentEditor.test.tsx,_components/EvalsTab/**}` | L6 | L8, L4, L5 | shared tree |
| L8 — client dashboard | implementer | W18, W19, W20 | `client/src/vendor/ui/{nav.ts,kit/Checkbox.tsx}`, `client/src/app/eval/**`, the app-shell helpers test | L6 | L7, L4, L5 | shared tree |

Schedule: **L1 → { server chain L2 → L3 → L4 → L5 } ∥ { L6 → (L7 ∥ L8) }**.

Client lanes test against mocked `fetch`, so they need only the L1 contracts and never the running server.
`service.ts` and `routes.ts` appear in both L3 and L4. They are serialised (L4 depends on L3) and never
parallel, which is allowed.

**No lane edits `eval.json`/`prReview.json` except L6.** A missing key found in L7/L8 is reported, not added. The
integration pass adds it.

**Integration** (the main session, after the last lane), over the whole tree:
1. Run the full Verification plan below.
2. Run cross-lane checks:
   - `modules/index.ts` registers `eval`;
   - both vendor copies are byte-identical;
   - `pnpm db:migrate` + `pnpm db:seed` on the dev DB, then `curl localhost:3001/eval/overview` lists the Security
     Reviewer with ≥8 cases;
   - `grep -rnE "#[0-9a-fA-F]{3,6}\b|rgb\(" client/src/app/eval "client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab" client/src/components/EvalRunButton "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components"` → nothing (NFR-7; then a visual comparison against `docs/design/screenshots/eval-pipeline/*.webp`).
3. Do the AC-113 manual experiment on the live stack (seeded prompt → run; prompt "flag every changed line" →
   run; Compare). Its deliverables are the compare-modal screenshot and a screencast.
4. Run `pnpm verify:l06` with and without Docker, for AC-110/111.

---

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | typecheck clean · unit suite green · arch:check at the 20-warning baseline, no new violation |
| `node scripts/verify.mjs server --it` | repo root | — | integration lane green **and 0 skipped** (`server/INSIGHTS.md:31`); run only at integration, never while lanes hammer Docker (`:91`) |
| `pnpm verify:l06` | `server/` | pnpm | exits 0 with Docker (0 skipped); exits 0 without Docker with a non-zero `skipped` in the `Tests` line |
| `pnpm db:migrate` then `pnpm db:seed` | `server/` | pnpm | `✓ migrations applied` and `✓ seeded`; a second seed changes no counts |
| `node scripts/verify.mjs client` | repo root | — | typecheck + full client unit suite green (incl. vendor-shared-sync) |
| `pnpm build` | `client/` | pnpm | builds — required (a new value import from `@devdigest/shared` plus two new routes). Stop `pnpm dev` first (`client/INSIGHTS.md:166`) |
| `node scripts/verify.mjs specs` | repo root | — | only if anyone touches `specs/` (nobody should) |

---

## Assumptions

- **A1 — Replace, not extend, the old eval contracts and tables.** They are one row per case. Their only consumer
  is one test fixture (`server/INSIGHTS.md:70`).
- **A2 — Two generated migrations (0019 adds, 0020 drops) instead of one.** This follows `server/INSIGHTS.md:83`.
  `eval_cases`/`eval_runs` are empty on every DB: no writer exists in `src`, and the seed leaves them empty
  (`seed.ts:37`). W2's first `Done means` checks this before migrating.
- **A3 — Precision is computed per case** (Spec follow-up 1). Recall, precision and citation all decompose over
  outcomes, which is what AC-91's common-case recomputation requires.
- **A4 — The 15-minute rule is lazy.** It is applied on every run read and on run start
  (`failStaleRuns(now − 15 min)`), plus once at boot. It is not a timer. The executor's final write is
  conditional on `status='running'`.
- **A5 — `latest_run` on the overview is the newest run of any status**, so a running run shows as running. The
  metrics come from that run and are "n/a" while it runs.
- **A6 — Metric-card deltas are passed to `MetricCard` in whole points.** `MetricCard` prints
  `Math.abs(delta).toFixed(2)` (`client/src/vendor/ui/charts/MetricCard.tsx:57`). If that reads badly, the
  executor may compose the card from `Card` with the same tokens instead of editing `MetricCard`.
- **A7 — The prompt diff is computed on the server** (AC-92) by porting the client's `diffLines` algorithm into
  `modules/eval/helpers/compare.ts`. The client renders the server's lines, so the client `diffLines` is not promoted.
- **A8 — The background run is a detached promise, not a `JobRunner` job.** `JobRunner` wraps handlers in a 120 s
  timeout and retries (`server/src/platform/jobs.ts:40-41,66-76`), which would cut a suite run short or rerun it.
- **A9 — `parseUnifiedDiff` reaches the eval service as an injected function from `routes.ts`.** Ring-1 helpers
  take an already-parsed `UnifiedDiff`. This follows the precedent of `modules/brief/helpers/diff-stats.ts:7`.
- **A10 — The eval task line repeats the trusted wording of `taskLine` without the author.** Like review runs,
  the PR title appears in it. NFR-5 names only the diff and the body as needing delimiters.
- **A11 — Escape-to-close goes into `vendor/ui/kit/Modal.tsx` for every modal that passes `onClose`.** The
  alternative was a per-feature hook in two routes. ConfirmDialog is never opened on top of an eval modal.
- **A12 — FindingCard gets the review's `agent_id` from `ReviewRunAccordion` via `FindingsPanel`** (AC-5), because
  `FindingRecord` does not carry it.

## Open questions

None.

## Research used

No `researcher` dispatch. Every fact was settled in the repo:
- the partial-index API: `server/node_modules/drizzle-orm/pg-core/indexes.d.ts:67`;
- drizzle versions: 0.38.4 / kit 0.30.6;
- the remaining facts: the INSIGHTS and source citations above.

## Rollback / blast radius

- Reverting files undoes all code, contracts, seed and client changes.
- **Not revertible by reverting files:**
  - migrations 0019/0020 drop `eval_runs` and three `eval_cases` columns, and add tables and columns. A revert
    needs a new generated migration in the opposite direction, or a dev-DB rebuild. Never use
    `docker compose down -v` (root `CLAUDE.md`).
  - Seeded PR #483, its review, its findings and its cases stay in any DB that ran the seed. Remove them by
    deleting PR #483, which cascades to the review and findings; cases keep `source_finding_id = NULL`. Then
    delete `eval_cases` where `source_pr_number = 483`.
- Shared surface touched:
  - `GET /pulls/:id/reviews`: two added nullish fields;
  - `vendor/ui` `Modal`: Escape now closes every modal that passes `onClose`;
  - `vendor/ui` `Checkbox`: an optional `disabled`;
  - the sidebar NAV: one item.
