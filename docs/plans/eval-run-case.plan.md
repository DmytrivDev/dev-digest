# Implementation plan: Eval "Run case": save and run one eval case from the case editor and the case row

**Route**: A (spec-driven).
**Requirements source**: `specs/SPEC-07-eval-run-case.md` (Status: approved). It has 49 ACs and 5 NFRs, and
0 `[NEEDS CLARIFICATION]` markers (checked with `grep -n "\[NEEDS CLARIFICATION"`). Its Open questions section
reads "None". This plan implements those requirements. It does not define them and it does not change them.
**Builds on**: the SPEC-04 and SPEC-05 implementations (`docs/plans/eval-pipeline.plan.md`,
`docs/plans/eval-case-editor-and-trend.plan.md`). Module layout, test harnesses and naming follow those plans.
**Execution mode**: multi-agent, chosen by the user (relayed by the orchestrator on 2026-10-10). The schedule is
**L0 (contracts + DB) → { L1 server ∥ (L2a → L2b) client } → L3 integration**.
**Branch**: `lesson-06`, which is already checked out. This plan creates no branch and **no lane commits**.
**Out of scope**:
- Every Non-goal of the spec (`specs/SPEC-07-eval-run-case.md:54-76`):
  - the "Run on save" toggle, the "edited since this run" hint, the agent version on the Last run line and a
    keyboard shortcut;
  - case runs in history, the runs table, compare or the overview;
  - cost or token aggregation of case runs, a completion toast, a per-route rate limit and new eligibility codes;
  - subset runs, cancelling a run, and a new e2e flow.
- The files the orchestrator has already changed in the working tree. **No lane touches them**: `CLAUDE.md`,
  `.github/workflows/**`, `.github/actions/**`, `evals/**`, `specs/**`.

Architecture review and security review are done by separate agents.

---

## Requirements traceability

Line numbers are `specs/SPEC-07-eval-run-case.md:<line>`.

| Req | Requirement (short) | Source | Work items | Checked by |
|---|---|---|---|---|
| AC-1 | footer: Cancel · secondary "Run case" (`Play`) · primary Save, in all 3 modes; no "Run on save" | :98 | W6, W9 | W9 `EvalCaseModal.test.tsx` |
| AC-2 | Run case disabled under every SPEC-05 AC-13 Save-disabling condition | :104 | W9 | W9 test |
| AC-3 | Run case disabled while a run of either scope is running | :109 | W6, W9 | W9 test |
| AC-4 | changed existing case → PATCH, then POST run, only after the PATCH succeeded | :114 | W9 | W9 `EvalCaseModal.requests.test.tsx` |
| AC-5 | unchanged case → only `POST /eval/cases/:id/runs` | :120 | W9 | W9 requests test |
| AC-6 | create mode → POST create, then POST run for the 201 id | :124 | W10 | W10 requests test |
| AC-7 | after the create's 201 → edit modal at `?case=<id>`, case already in the cached list | :129 | W6, W10 | W10 `EvalsTab.test.tsx` |
| AC-8 | double click → at most one save and one run start | :135 | W9, W10 | W9 + W10 requests tests |
| AC-9 | failed save → no run start; modal open, fields kept, one toast | :139 | W9, W10 | W9 (PATCH) + W10 (create) requests tests |
| AC-10 | saved then start rejected (409/422/429) → one toast "Case saved; not run: …" | :145 | W6, W9 | W9 requests test |
| AC-11 | create OK then start rejected → edit modal for the new id; 2nd click sends only the run POST | :151 | W10 | W10 EvalsTab test |
| AC-12 | 202 → modal stays open | :157 | W9 | W9 requests test |
| AC-13 | own case run running → "Running…" in place of Last run | :160 | W6, W9 | W9 test |
| AC-14 | own case run running → Run case in loading state, disabled | :165 | W9 | W9 test |
| AC-15 | own case run running → Save still enabled and sends the PATCH | :169 | W9 | W9 test |
| AC-16 | own run final → Last run line from the new outcome at the first 3 s poll | :174 | W6, W9 | W9 requests test (fake timers) |
| AC-17 | own run `failed: interrupted` → "Run interrupted — try again"; Run case enabled again | :181 | W6, W9 | W9 requests test |
| AC-18 | modal closed mid-run → row updates when the run settles, no toast | :187 | W10 | W10 EvalsTab test |
| AC-19 | every row has a "Run" `Play` icon button before Edit and Delete | :195 | W6, W8 | W8 EvalsTab test |
| AC-20 | any running run → every row's Run disabled | :199 | W6, W8 | W8 EvalsTab test |
| AC-21 | row Run → exactly one run POST (also on double click); no `case` URL param | :204 | W6, W8 | W8 EvalsTab test |
| AC-22 | running case run → spinner labelled "Running" in place of that row's status icon | :209 | W8 | W8 EvalsTab test |
| AC-23 | row start rejected 409/422/429 → one toast with the mapped text | :213 | W6, W8 | W8 EvalsTab test |
| AC-24 | running case run → suite button reads "Running case…", disabled (tab + dashboard) | :219 | W6, W7 | W7 `EvalRunButton.test.tsx` + `EvalAgentDetail.test.tsx` |
| AC-25 | `scope:"case"` runs excluded from cards, badge, trend, history, runs table | :224 | W6, W7, W8 | W7 EvalAgentDetail test + W8 EvalsTab test |
| AC-26 | `POST /eval/cases/:id/runs` → running row with `scope:"case"`, `case_id`, `cases_total 1`; 202 before the model call ends | :232 | W1, W2, W3, W5 | W5 `eval-case-runs.it.test.ts` |
| AC-27 | agent version + config recorded at start, like a suite run | :239 | W3, W5 | W5 it test |
| AC-28 | review uses the case's diff/meta/expectation as of the start | :244 | W3, W4 | W4 `eval-case-run.test.ts` |
| AC-29 | engine input identical to a suite run of that case; sentinel absent | :249 | W3, W4 | W4 test |
| AC-30 | at most one engine review, no other model call | :254 | W3, W4 | W4 test |
| AC-31 | code-only scoring as a suite run | :259 | W4 | W4 test |
| AC-32 | scored case → run `completed`, `finished_at` set, one outcome | :264 | W5 | W5 it test |
| AC-33 | model failure or 120 s → `failed: all_cases_errored`, one errored outcome with its reason | :269 | W4 | W4 test |
| AC-34 | any running run of the agent → case-run start 409 `run_in_progress`, no row | :275 | W2, W3, W5 | W5 it test |
| AC-35 | running case run → suite-run start 409 `run_in_progress` | :280 | W3, W5 | W5 it test |
| AC-36 | no provider key → 422 `provider_key_missing`, no row | :284 | W3, W5 | W5 it test |
| AC-37 | case id outside the workspace → 404, no row, zero model calls | :288 | W3, W5 | W5 it test |
| AC-38 | 15 min stale or restart → `failed: interrupted` | :293 | W5 | W5 it test |
| AC-39 | client disconnect → run still reaches its final status | :299 | W5 | W5 it test |
| AC-40 | case deleted mid-run → run finishes, outcome row kept | :303 | W2, W5 | W5 it test |
| AC-41 | run `cost_usd` = outcome cost (errored → null); `duration_ms` = finished − started | :308 | W4, W5 | W4 test (cost) + W5 it test (duration) |
| AC-42 | `last_outcome` = newest outcome of either scope | :313 | W5 | W5 it test |
| AC-43 | `GET /eval/runs/:id` on a case run → `scope`, `case_id`, 1 outcome | :319 | W2, W5 | W5 it test |
| AC-44 | every suite run (pre-existing included) reports `scope:"suite"`, `case_id:null` | :323 | W1, W2, W5 | W5 it test |
| AC-45 | runs list = ≤ 20 newest suite runs (case runs not counted) + the running case run | :330 | W3, W5 | W5 it test |
| AC-46 | dashboard `runs` = the same as AC-45 | :336 | W3, W5 | W5 it test |
| AC-47 | dashboard trend + alert from completed suite runs only | :340 | W3, W5 | W5 it test |
| AC-48 | overview `latest_run` = newest suite run (or null) | :345 | W3, W5 | W5 it test |
| AC-49 | compare naming a case run → 422 `not_suite_run` | :350 | W1, W3, W5 | W5 it test |
| NFR-1 | every new string from `messages/en/eval.json` | :393 | W1, W6 (W7–W10 consume) | component tests assert English text |
| NFR-2 | Run case + row Run reachable by Tab, operable by Enter/Space; row Run opens no modal | :399 | W8, W9 | W8 + W9 tests (see Spec follow-up 1) |
| NFR-3 | never-answering model → case run final within 125 s | :405 | W4 | W4 test (fake timers) |
| NFR-4 | another workspace's case-run id → 404 on run read and compare | :410 | W5 | W5 it test |
| NFR-5 | `@devdigest/ui` `Button` / `IconBtn` + tokens, no hex / `rgb(` | :414 | W6, W8, W9, W11 | grep in W8/W9 + manual compare at W11 |

Every AC and NFR maps to at least one work item. W11 (integration) appears through NFR-5 and runs the full
Verification plan.

---

## Spec follow-ups

These are addressed to `spec-creator` and the user. None of them is applied: this plan implements the spec as
written. None of them is a blocker.

1. **NFR-2's "tabbing reaches each button" cannot be simulated as worded.** The client has no
   `@testing-library/user-event` (`client/INSIGHTS.md:57`), and a jsdom Tab keypress does not move focus. SPEC-05
   hit the same limit (`docs/plans/eval-case-editor-and-trend.plan.md:110-118`). The plan checks it this way:
   - each control is a native `<button>` without `tabIndex={-1}`;
   - `element.focus()` lands on it;
   - Enter/Space activation is a native button's click, so it is exercised with `fireEvent.click` on the focused
     element;
   - the row's open-modal handler must not fire, and the URL must not gain `case`.

   The spec could word the check as "every control is a natively focusable button".
2. **AC-44 mentions "seeded … suite runs", but the seed writes no `eval_suite_runs` row.** Only the schema and
   `modules/eval/repository.ts` reference the table, and `server/src/db/seed.ts` does not. The plan checks the
   pre-existing half with a row inserted directly through Drizzle **without** `scope`/`case_id`, so the column
   defaults apply, plus a new suite run.
3. **No criterion names the toast for a run start rejected after Run case on an unchanged case** (AC-5's path).
   AC-10 covers "saved, then rejected". The plan reuses AC-23's rule for that path: when nothing was saved, the
   toast is the plain mapped message, without the "Case saved; not run:" prefix. The spec could state it.

---

## Affected surface

Skills come from `.claude/skill-routing.md`. Abbreviations: OA = onion-architecture, FUA =
frontend-ui-architecture, sec = security, fastify = fastify-best-practices, drizzle = drizzle-orm-patterns, pg =
postgresql-table-design, react = react-best-practices, RTL = react-testing-library.

### L0: contracts + DB

| File | New/Mod | Package | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/vendor/shared/contracts/eval-ci.ts` | Mod | api | ring 2 | zod | Section order is load-bearing at import time (`server/INSIGHTS.md:56`): `EvalRunScope` must sit **above** `EvalSuiteRun` (`eval-ci.ts:199`). The file must stay byte-identical to the client copy (`server/INSIGHTS.md:50,81`). |
| `client/src/vendor/shared/contracts/eval-ci.ts` | Mod | web | vendored ring 2 | zod | same bytes as the server copy (`client/src/test/vendor-shared-sync.test.ts`) |
| `server/src/db/schema/eval.ts` | Mod | api | ring 4 | OA, drizzle, pg | A new NOT NULL column needs a DEFAULT on a populated table (`server/INSIGHTS.md:87`). Additions only, so the `strict: true` rename prompt cannot fire (`server/INSIGHTS.md:87`). |
| `server/src/db/migrations/0022_<generated>.sql` + `meta/_journal.json`, `meta/0022_snapshot.json` | New (generated) | api | ring 4 | pg | `pnpm db:generate` only; never hand-written (root `CLAUDE.md`, Do-not-touch) |
| `server/src/modules/eval/helpers/dto.ts` | Mod | api | ring 1 mapper | OA | Ban 3: snake_case DTO out (`helpers/dto.ts:113`) |
| `server/test/eval-contracts.test.ts` | Mod (fixture + 2 cases) | api | test | — (unrouted) | Server typecheck excludes `server/test`, so a stale fixture fails only at runtime (`server/INSIGHTS.md:111`) |
| `client/src/lib/eval.ts` | Mod (`COMPARE_ERROR_KEY.not_suite_run` only) | web | domain module | — (unrouted, see gaps) | `Record<EvalCompareErrorCode, string>` (`client/src/lib/eval.ts:183`) stops compiling the moment the enum grows |
| `client/messages/en/eval.json` | Mod (`errors.not_suite_run` only) | web | i18n | FUA | A missing key renders raw (`client/INSIGHTS.md:34`) |
| `client/src/app/agents/[id]/…/EvalsTab/EvalsTab.test.tsx`, `…/EvalsTab/_components/MetricTrend/MetricTrend.test.tsx` | Mod (fixture factories only) | web | test | RTL | `makeRun` returns a typed `EvalSuiteRun` with no cast (`EvalsTab.test.tsx:88`, `MetricTrend.test.tsx:32`). Client typecheck covers tests. |

### L1: server

| File | New/Mod | Package | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/modules/eval/constants.ts` | Mod | api | ring 1 | OA | Reason-code maps `satisfies Record<string, EvalCompareErrorCode>` (`constants.ts:83-87`) |
| `server/src/modules/eval/repository.ts` | Mod | api | ring 3 | OA, drizzle | Every `eval_suite_runs` read is scoped by `workspace_id` (`repository.ts:17-23`). The reapers stay scope-agnostic (`repository.ts:388-414`). |
| `server/src/modules/eval/service.ts` | Mod | api | ring 3 | OA, sec | It injects ports and never takes `Container` (`server/INSIGHTS.md:52`). The pre-check must see a running run of **either** scope (spec DR-4). |
| `server/src/modules/eval/routes.ts` | Mod | api | ring 4 | OA, fastify, sec | No drizzle import (Ban 1). A body-less POST arrives as `null`, so the route has **no body schema** (`server/INSIGHTS.md:108`, `routes.ts:43-44`). |
| `server/test/eval-manual-run.test.ts` | Mod (fake repository only) | api | test | — | Its `fakeRepo()` (`:93-173`) is cast `as unknown as EvalRepository`, so a renamed repository method fails only at runtime |
| `server/test/eval-case-run.test.ts` | New | api | test | — | unit; mirrors `fakeRepo` / `stubLlm`; awaits `done` |
| `server/test/eval-case-runs.it.test.ts` | New | api | test | — | The `.it.test.ts` suffix is required. Drain running runs before the next `buildApp()` (`server/INSIGHTS.md:73`). |

### L2: client

| File | New/Mod | Package | Home | Skills | Constraint to respect |
|---|---|---|---|---|---|
| `client/src/lib/eval.ts` (+ `eval.test.ts`) | Mod | web | domain module | — / RTL | pure; type-only imports from `@devdigest/shared` |
| `client/src/lib/hooks/eval.ts` | Mod | web | data hooks | FUA, react | Mutations carry `meta: { quietError: true }` and raise one mapped toast (`client/INSIGHTS.md:23`, `hooks/eval.ts:5-7`) |
| `client/messages/en/eval.json` | Mod | web | i18n | FUA | every new key is added in W6 |
| `client/src/vendor/ui/primitives/IconBtn.tsx` | Mod | web | design system | FUA | It has no `disabled` prop today (`IconBtn.tsx:4-18`). The new optional prop must keep the default render unchanged. |
| `client/src/components/EvalRunButton/{EvalRunButton.tsx, EvalRunButton.test.tsx}` | Mod | web | shared (2 routes) | FUA, react / RTL | label logic only (`EvalRunButton.tsx:31-33`) |
| `client/src/app/eval/[agentId]/_components/EvalAgentDetail/{EvalAgentDetail.tsx, EvalAgentDetail.test.tsx}` | Mod | web | route-local | FUA, react / RTL | Existing tests stay unedited; only new tests are added |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx}` | Mod | web | route-local | FUA, react / RTL | Name queries only; never an unnamed role query (`client/INSIGHTS.md:59`) |
| `…/EvalsTab/_components/EvalCaseRow/{EvalCaseRow.tsx, styles.ts}` | Mod | web | route-local | FUA, react | Icon buttons sit inside the `stopPropagation` span (`EvalCaseRow.tsx:71-76`) |
| `…/EvalsTab/_components/EvalCaseModal/{EvalCaseModal.tsx, helpers.ts, styles.ts, EvalCaseModal.test.tsx, EvalCaseModal.requests.test.tsx}` | Mod | web | route-local | FUA, react / RTL | `EvalCaseModal.test.tsx:12-15` mocks the hooks module, so every newly used hook must be added to that mock |
| `…/EvalCaseModal/_components/LastRunLine/{LastRunLine.tsx, styles.ts, index.ts}` | New | web | route-local child | FUA, react | One component with one job; it keeps the modal from growing past ~200 lines (react skill) |

### L3: integration

| File | New/Mod | Package | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|---|
| `server/package.json` | Mod (the `verify:l06` line only) | api | config | sec | Edit one line (`server/package.json:18`); no `pnpm install`, no dependency change |

**Coverage gaps:**
- `client/src/lib/eval.ts` matches no routing row: FUA covers only `lib/hooks/**` and `lib/api.ts`, and react
  covers only `*.tsx` and `lib/hooks/**`. Its changes are pure helpers and get only test coverage.
- `server/test/**` (all three server test files) is unrouted, because OA excludes `*.test.ts` and no row
  covers server tests.
- The generated `0022_*.sql` is not hand-reviewed.
- This plan file is unrouted by design.

---

## Contract changes

- **vendor/shared: yes.** One file, `contracts/eval-ci.ts`, changes in both copies, byte-identical, all in W1:
  - **New `EvalRunScope`**, placed **directly after `EvalRunErrorReason`** (`eval-ci.ts:186-187`) and therefore
    above `EvalSuiteRun`:

    ```ts
    /** A run covers the agent's whole suite, or exactly one case (SPEC-07). */
    export const EvalRunScope = z.enum(['suite', 'case']);
    export type EvalRunScope = z.infer<typeof EvalRunScope>;
    ```
  - **`EvalSuiteRun` gains two required fields.** No `.refine` is added: it would turn the schema into `ZodEffects`
    under `EvalCompare`, `EvalOverviewRow` and `EvalDashboard`. The DB CHECK in W2 owns the invariant
    (Assumption A3).
    - `scope: EvalRunScope`
    - `case_id: z.string().nullable()`, with the comment "the run's one case when scope = "case"; null exactly
      when scope = "suite"".
  - **`EvalCompareErrorCode`** gains `'not_suite_run'`, appended at the end of the enum.
  - **`EvalRunStartResponse` is unchanged.** The case-run 202 reuses it (spec, Contracts).
- **Migration: yes, one.** It is `0022_<generated>.sql`, produced by `cd server && pnpm db:generate`. On
  `eval_suite_runs` it adds:
  - `scope text DEFAULT 'suite' NOT NULL`, enum `suite|case`. Every existing row becomes `suite` (AC-44).
  - `case_id uuid`, nullable, **without a foreign key**. Deleting the case must keep the run and its outcome
    (AC-40), the same choice as `eval_case_outcomes.case_id` (`schema/eval.ts:102-111`).
  - a CHECK `eval_suite_runs_scope_case_ck`: `(scope = 'case') = (case_id IS NOT NULL)`.

  The partial unique index `eval_suite_runs_one_running_uq` (`schema/eval.ts:96-98`) is **unchanged**. Keyed on
  `agent_id WHERE status = 'running'`, it already spans both scopes, so it serves as the AC-34/AC-35 lock. The
  migration only adds columns, so no rename prompt fires. Apply it with `pnpm db:migrate` while Docker Postgres
  is up. **Never run `docker compose down -v`.**
- **Seed: no.** Case runs are user-triggered, and the seed writes no runs (Spec follow-up 2). The seeded cases
  stay runnable.
- **Client build check needed: no new value import.** The client already value-imports the `@devdigest/shared`
  barrel (`EvalCaseModal/helpers.ts:4`, `lib/eval.ts`), so the build already resolves it. The one runtime risk is
  a TDZ crash from a misplaced `EvalRunScope`. Vitest catches that at import, because the modal tests load the
  barrel. A `pnpm build` at L3 is **optional**. If it is run, follow the dev-server protocol: stop `pnpm dev` →
  `pnpm build` → `rm -rf client/.next` → restart dev → never trust the first render (`client/INSIGHTS.md:26,46`).
- **i18n: yes.** Only `client/messages/en/eval.json` changes:
  - W1 adds `errors.not_suite_run`;
  - W6 adds the rest (listed in W6).

---

## Work items

Rules for every item:
- Server **Verify** lines also run `arch:check`, because `verify.mjs` does by default. The arch:check count must
  not grow; the baseline is pre-existing warnings only (`server/INSIGHTS.md:9`).
- Run each item's Verify **once, after its last edit**, as one chained call (`server/INSIGHTS.md:94`).
- **Client tests under `[id]` / `[agentId]` routes run by name filter.** `verify.mjs client <files>` silently
  skips them (`client/INSIGHTS.md:28`).
- **Known load flake:** `server/test/brief-budget-cost.test.ts` (`server/INSIGHTS.md:36`). If it is the only red
  test, re-run it alone before treating it as a regression.

### Lane L0: contracts + DB (runs alone, first)

#### W1: `scope` / `case_id` / `not_suite_run` in both vendor copies, plus the fixtures and key that the change breaks
- **Serves:** enables AC-26, AC-43, AC-44 (wire fields) and AC-49 (error code); NFR-1 (the new compare message).
- **Do:**
  - Apply "Contract changes → vendor/shared" to `server/src/vendor/shared/contracts/eval-ci.ts`. Then copy the
    file byte-for-byte to `client/src/vendor/shared/contracts/eval-ci.ts`.
  - **`server/test/eval-contracts.test.ts`:**
    - The `run()` fixture (`:60-80`) gains `scope: 'suite'` and `case_id: null`.
    - Add a case: `EvalSuiteRun` parses a case run (`scope:'case'`, `case_id:'c1'`, `cases_total:1`).
    - Add a case: `EvalSuiteRun` rejects a run without `scope`.
    - Add a case: `EvalCompareErrorCode.options` contains `not_suite_run`.
    - Also check the overview/dashboard fixtures at `:129-150`, which build runs through `run()`.
  - **`client/src/lib/eval.ts`:** add `not_suite_run: "errors.not_suite_run"` to `COMPARE_ERROR_KEY`. The existing
    completeness test (`client/src/lib/eval.test.ts:200-220`) then requires the key.
  - **`client/messages/en/eval.json`:** add `errors.not_suite_run`: "Only suite runs can be compared."
  - **Client fixture factories:** `makeRun` in `EvalsTab.test.tsx:88` and in `MetricTrend.test.tsx:32` gain
    `scope: "suite", case_id: null` defaults. The other factories cast `as EvalSuiteRun` and need nothing:
    `EvalAgentDetail.test.tsx:38`, `CompareRunsModal.test.tsx:10`, `EvalOverview.test.tsx:19` and
    `EvalRunButton.test.tsx:30`. Leave those files untouched.
- **Files:** both `contracts/eval-ci.ts` copies, `server/test/eval-contracts.test.ts`, `client/src/lib/eval.ts`,
  `client/messages/en/eval.json`, `…/EvalsTab/EvalsTab.test.tsx` (factory only),
  `…/EvalsTab/_components/MetricTrend/MetricTrend.test.tsx` (factory only).
- **Done means:**
  - Both vendor-sync tests pass.
  - `eval-contracts.test.ts` is green, including the 3 new cases.
  - The `@devdigest/shared` import throws no `ReferenceError`.
  - The client typecheck is green, and `eval.test.ts` resolves `errors.not_suite_run` to English.
  - The server **typecheck** may stay red until W2 (`runRowToDto` lacks the new fields). W2 is the lane's green
    gate.
- **Verify:**
  - `node scripts/verify.mjs server test/eval-contracts.test.ts test/vendor-shared-sync.test.ts`
  - `node scripts/verify.mjs client src/test/vendor-shared-sync.test.ts src/lib/eval.test.ts`
  - `cd client && pnpm exec vitest run EvalsTab MetricTrend`
- **Rules that apply:**
  - zod: `type-use-z-infer` (the schema and its type share one name); `schema-use-enums`;
    `object-optional-vs-nullable` (`case_id` is required and nullable).
  - OA §2: the contract stays technology-neutral.
  - Section order per `server/INSIGHTS.md:56`.
- **Risk:** low. The required fields ripple only into fixtures; production readers get them from W2.

#### W2: `eval_suite_runs.scope` + `case_id` (one generated migration) and the DTO
- **Serves:** AC-26, AC-43, AC-44; enables AC-34 (the lock spans scopes, unchanged index), AC-40 (no FK) and every
  L1 item.
- **Do:**
  - **In `server/src/db/schema/eval.ts`, on `evalSuiteRuns`:**
    - add `scope: text('scope', { enum: ['suite', 'case'] }).notNull().default('suite')`;
    - add `caseId: uuid('case_id')`, with no `.references()`, and a comment saying why (AC-40, like
      `evalCaseOutcomes.caseId`);
    - add `check('eval_suite_runs_scope_case_ck', sql\`(${t.scope} = 'case') = (${t.caseId} IS NOT NULL)\`)`.
      `check` and `sql` are already imported (`schema/eval.ts:1,13`).
    - Rewrite the table doc comment (`:64`): one execution of an agent's whole suite, **or of exactly one case**
      (`scope`). The table name stays `eval_suite_runs` (Assumption A1).
  - **In `server/`:** run `pnpm db:generate`, then `pnpm db:migrate` with Docker Postgres up. `EvalSuiteRunRow` is
    `$inferSelect` (`server/src/db/rows.ts:23`), so it follows on its own.
  - **`helpers/dto.ts` `runRowToDto` (`:113-136`):** emit `scope: row.scope` and `case_id: row.caseId`.
  - **Server tests:**
    - grep `server/test` for an exact `toEqual` on a full run DTO (`eval-runs.it.test.ts`,
      `eval-compare.it.test.ts`, `eval-experiment.it.test.ts`, `eval-manual-cases.it.test.ts`), and add
      `scope: 'suite', case_id: null` only where an exact match now fails;
    - do not loosen any assertion.
- **Files:** `server/src/db/schema/eval.ts`, `server/src/db/migrations/0022_*.sql`, `server/src/db/migrations/meta/*`,
  `server/src/modules/eval/helpers/dto.ts`, and whichever existing `server/test/eval-*.it.test.ts` the grep finds
  (fixtures/expectations only).
- **Done means:**
  - Exactly one new migration exists, `0022_<generated>.sql`, and `db:generate` did not prompt.
  - Its SQL contains `ADD COLUMN "scope" text DEFAULT 'suite' NOT NULL`, `ADD COLUMN "case_id" uuid` and the
    CHECK. It contains no DROP and no FK on `case_id`.
  - `pnpm db:migrate` succeeds on the dev DB.
  - `select distinct scope from eval_suite_runs` returns only `suite` (or no rows).
  - `node scripts/verify.mjs server` is green: typecheck, unit suite, arch at baseline.
  - `node scripts/verify.mjs client` is green.
  - The existing eval integration files are green with **0 skipped**.
- **Verify:**
  - in `server/`: `pnpm db:generate && pnpm db:migrate`
  - from the repo root: `node scripts/verify.mjs server` and `node scripts/verify.mjs client`
  - in `server/` with Docker up:
    `pnpm exec vitest run test/eval-runs.it.test.ts test/eval-compare.it.test.ts test/eval-manual-cases.it.test.ts test/eval-experiment.it.test.ts`
    Read the skipped count (`server/INSIGHTS.md:31`).
- **Rules that apply:**
  - pg: NOT NULL + DEFAULT for a column that every row must carry; a CHECK for a two-column invariant.
  - drizzle: generate + migrate, never `push`.
  - OA Ban 3: the DTO is the only shape that leaves the module.
- **Risk:** medium. A migration cannot be reverted by reverting files (see Rollback).
  **Isolation: runs alone**, because the generator rewrites `migrations/meta`.

### Lane L1: server (after L0; parallel with L2a/L2b)

#### W3: Case-run start, scope-aware run reads, and `not_suite_run` in repository, service and route
- **Serves:** AC-26, AC-27, AC-28, AC-29, AC-30 (by construction), AC-34, AC-35, AC-36, AC-37, AC-45, AC-46,
  AC-47, AC-48, AC-49.
- **Do:**
  - **`constants.ts`:** `COMPARE_ERROR.notSuiteRun: 'not_suite_run'`. The `satisfies` clause keeps it tied to the
    enum.
  - **`repository.ts`:**
    - `InsertEvalRun` gains `scope?: 'suite' | 'case'` (default `'suite'`) and `caseId?: string | null` (default
      `null`). `insertRun` passes both through. The `'conflict'` path is unchanged: it is the partial unique
      index firing for either scope.
    - Rename `listRuns` → **`listSuiteRuns(workspaceId, agentId, limit)`** and add `eq(t.evalSuiteRuns.scope, 'suite')`.
      Because the filter runs in SQL before `.limit()`, case runs never use up the 20-run window (AC-45, EC-16).
    - New **`runningRun(workspaceId, agentId): Promise<EvalSuiteRunRow | undefined>`**: the agent's `running` row
      of **any** scope. With the unique index there is at most one.
    - Rename `latestRunPerAgent` → **`latestSuiteRunPerAgent`** and add the scope filter (AC-48).
    - Leave `getRun`, `failStaleRuns`, `failAllRunning`, `isRunning`, `finishRun`, `bumpProgress`, `insertOutcome`
      and `latestOutcomesForCases` **untouched**. They are already scope-agnostic, which is exactly what AC-38,
      AC-42 and AC-43 need. Update the header comment's list of bare-id methods if a name changed.
  - **`service.ts`** (deps unchanged: `repo`, `agents`, `parseDiff`, `resolveLlm`, `now`). Extract private helpers so
    both starts share one path. That shared path is what AC-27/AC-29 parity rests on:
    - `assertNoRunningRun(workspaceId, agentId)`: `reapStale`, then `repo.runningRun` → `runInProgress()`. This
      replaces `recent.some(r => r.status === 'running')` (`service.ts:351-352`) in `startRun`, so a running
      **case** run blocks a suite start (AC-35, DR-4).
    - `resolveLlmOrKeyMissing(provider)`: the existing `ConfigError` → 422 `provider_key_missing` block
      (`:363-375`).
    - `recordConfig(agent)` → `{ config, skillBlocks }`: the existing `:377-393` (AC-27).
    - `snapshotOf(row): CaseSnapshot`: the existing `:405-414` mapping.
    - `launch(run, cases, config, skillBlocks, llm)`: the existing executor construction + detached `.catch`
      (`:416-432`), returning `done`.
  - **New `startCaseRun(workspaceId, caseId): Promise<StartRunResult>`.** The steps run in this order, and no row
    is written before the last one:
    1. `repo.getCase(workspaceId, caseId)`. If it is absent → `NotFoundError('Eval case not found')` (AC-37). This
       comes before any LLM resolution, so the call count is zero.
    2. `agents.getById(workspaceId, row.agentId)`. If it is absent → `NotFoundError('Agent not found')`.
    3. `assertNoRunningRun` → 409 (AC-34).
    4. `resolveLlmOrKeyMissing` → 422 (AC-36).
    5. `recordConfig(agent)`.
    6. `repo.insertRun({ workspaceId, agentId, agentVersion: agent.version, config, caseIds: [row.id], casesTotal: 1, scope: 'case', caseId: row.id })`.
       `'conflict'` → 409 (AC-34 race).
    7. `launch(run, [snapshotOf(row)], …)`. The snapshot is taken here, at start (AC-28).
    8. Return `{ run_id, status: 'running', cases_total: 1, done }`.

    A finding-born case whose source is gone stays runnable, and no eligibility check is added (Non-goal, EC-13).
  - **`listRuns`** (`:438-444`), via a private `runsForViews(ws, agentId)`: `listSuiteRuns(..., RUN_LIST_LIMIT)`,
    then the `runningRun` **if its `scope === 'case'`**, appended at the end (AC-45: "followed by").
  - **`dashboard`** (`:530-565`):
    - `runs` comes from `runsForViews` (AC-46);
    - `completed = runs.filter(r => r.scope === 'suite' && r.status === 'completed')` feeds the trend and the alert
      (AC-47).
  - **`overview`:** use `latestSuiteRunPerAgent` (AC-48).
  - **`compare`:** right after the 404 check and before `sameRun`, `if (a.scope !== 'suite' || b.scope !== 'suite')`
    → `AppError(COMPARE_ERROR.notSuiteRun, 'Only suite runs can be compared.', 422)` (AC-49). Another
    workspace's id is still a 404 from the scoped `getRun` (NFR-4).
  - **`getRun`:** unchanged. The DTO now carries `scope`/`case_id` (AC-43).
  - Update the class doc comment: suite runs **and single-case runs**.
- **`routes.ts`:**
  - `app.post('/eval/cases/:id/runs', { schema: { params: IdParams } }, …)` → `const { done: _done, ...started } = await service.startCaseRun(workspaceId, req.params.id); return reply.code(202).send(started);`
  - Add **no body schema**, with the same comment as `:95-96` (`server/INSIGHTS.md:108`).
  - Add no per-route rate limit (Non-goal; `server/src/app.ts:95-97`).
  - Add the endpoint to the header comment list (`:11-25`).
- **`server/test/eval-manual-run.test.ts`, fake only.** In `fakeRepo()` (`:153-155`), rename `listRuns` →
  `listSuiteRuns` and add `async runningRun() { return undefined; }`. Change no assertion.
- **Files:** `server/src/modules/eval/{constants.ts, repository.ts, service.ts, routes.ts}`,
  `server/test/eval-manual-run.test.ts` (fake repository only).
- **Done means:**
  - Typecheck is green and arch:check is at baseline.
  - `grep -n "listRuns\b\|latestRunPerAgent" server/src server/test` finds no caller of the old names (except
    `service.listRuns`, which keeps its name).
  - `service.ts` imports neither `adapters/` nor `platform/container`; `routes.ts` imports neither `drizzle-orm`
    nor `db/schema`.
  - In `startCaseRun`, `getCase` precedes `resolveLlm` (code read).
  - `eval-manual-run.test.ts` is still green.
- **Verify:**
  `node scripts/verify.mjs server src/modules/eval/service.ts src/modules/eval/routes.ts src/modules/eval/repository.ts src/modules/eval/constants.ts test/eval-manual-run.test.ts`
- **Rules that apply:**
  - OA §4: inject ports, no `Container`; Ban 1, Ban 2.
  - fastify: schema-first params; `reply.code(202)`.
  - sec: A01, because the case id is resolved through the workspace before anything else. Spend is bounded by
    the one-running-run lock.
  - The cooperative `isRunning` stop applies unchanged to case runs (`server/INSIGHTS.md:37`).
- **Risk:** medium. The lock and filter semantics change for every eval read path.

#### W4: Unit tests for the case-run path (no DB)
- **Serves:** AC-28, AC-29, AC-30, AC-31, AC-33, AC-41 (cost half), NFR-3.
- **Do:**
  - Create `server/test/eval-case-run.test.ts`. Copy the `fakeRepo()` / `makeService()` pattern of
    `server/test/eval-manual-run.test.ts:93-210`; do not import from it.
    - The fake also implements `runningRun`, `listSuiteRuns` and `getCase`.
    - Its `insertRun` records `scope`/`caseId`.
  - Use a capturing, gated stub LLM like `stubLlm` in `eval-runs.it.test.ts:59-115`. Always await the returned
    `done`.
  - **AC-28:**
    - start a case run with the stub gated;
    - call `updateCase` with a new diff and expectation (a manual case), then release;
    - the captured prompt holds the **old** diff, and the inserted outcome's `expectation` is the old one.
  - **AC-29:**
    - for one case and one config, capture the prompt of `startCaseRun(case)` and of `startRun` on an agent whose
      suite is exactly that case;
    - the message contents are equal;
    - a sentinel placed in name, notes, labels and source of a finding-born case, the way
      `eval-executor.test.ts:46,219-238` does it, is absent from the case-run prompt.
  - **AC-30:** a counting stub sees exactly one `completeStructured` call for a one-hunk case, and
    `complete`/`listModels` are never called. The stub throws if they are.
  - **AC-31:**
    - the stub returns a finding on the expectation's range, so `must_find` passes and the same range as
      `must_not_flag` fails;
    - a second model call would throw, which proves scoring is code-only.
  - **AC-33:**
    - a rejecting stub → `finishRun` with `failed` / `all_cases_errored` and one outcome `errored`,
      `llm_error`;
    - a stub that throws the "failed schema validation" message → `invalid_output`;
    - a never-settling stub with `vi.useFakeTimers()` → `timeout` (pattern: `eval-executor.test.ts:412`).
  - **NFR-3:** with the never-settling stub and fake timers, the run's `finishRun` has been called once 125 000 ms
    of simulated time have passed since the start.
  - **AC-41 (cost):**
    - an outcome costing 0.02 → the run's `costUsd` is 0.02;
    - an errored outcome → `null`.
- **Files:** `server/test/eval-case-run.test.ts`.
- **Done means:** the file is green, with one `it` per bullet above; no production file changes in this item.
- **Verify:** `node scripts/verify.mjs server test/eval-case-run.test.ts`
- **Rules that apply:**
  - OA §1: ring-1 scoring is testable without Docker.
  - sec: the untrusted delimiters are unchanged (SPEC-04 NFR-5), and the task slot stays trusted fixed text
    (`server/INSIGHTS.md:74`).
- **Risk:** low.

#### W5: Integration test for case runs and the suite-aggregate exclusions
- **Serves:** AC-26, AC-27, AC-32, AC-34…AC-40, AC-41 (duration), AC-42…AC-49, NFR-4.
- **Do:** create `server/test/eval-case-runs.it.test.ts`.
  - **Setup:**
    - mirror `server/test/eval-runs.it.test.ts`: Docker gate, `startPg`, `buildApp` with container overrides,
      `stubLlm`, `waitFor`;
    - use a second workspace per `eval-runs.it.test.ts:640-650`;
    - go through HTTP (`app.inject`) unless an AC needs the service's `done`.
  - **Drain:** in `afterEach`, `releaseAll()` the stub and wait until no `running` row is left before the next
    `buildApp()`. Otherwise the boot reaper flips it (`server/INSIGHTS.md:73`).
  - **Fixtures:** use only `sk_live_xxx` placeholders (`server/INSIGHTS.md:109`).
  - **AC-26:** gated stub → `POST /eval/cases/:id/runs` answers 202 `{ run_id, status: "running", cases_total: 1 }`
    while the call is still gated. The row has `status running`, `scope case`, `case_id = id`, `cases_total 1`.
  - **AC-27:** after the start, PATCH the agent's prompt, then release. The run's `agent_version` and
    `config.system_prompt` are the pre-edit ones.
  - **AC-32:** the run ends `completed`, `finished_at` is set, and `outcomes.length === 1`.
  - **AC-34:**
    - with a running suite run, and with a running case run of **another** case, a case-run start → 409
      `run_in_progress`;
    - the `eval_suite_runs` count is unchanged.
  - **AC-35:** with a running case run, `POST /agents/:id/eval/runs` → 409, and no suite-run row exists.
  - **AC-36:** with no key for the provider (the `MockSecretsProvider` setup of `eval-runs.it.test.ts`) → 422
    `provider_key_missing`, and no row.
  - **AC-37:** a second workspace's case id and a random uuid → 404. Neither workspace gains a row, and
    `stub.calls.length === 0`.
  - **AC-38:**
    - insert a running case-run row with `started_at` 16 min ago; a `GET /eval/runs/:id` → `failed`,
      `interrupted`;
    - insert a running case-run row, then `buildApp()` → it is `failed: interrupted`.
  - **AC-39:** start, never poll; `waitFor` on the DB row reaching `completed`.
  - **AC-40:** start gated, `DELETE /eval/cases/:id`, release. The run reaches a final status, and its outcome row
    exists.
  - **AC-41 (duration):** `duration_ms === Date.parse(finished_at) - Date.parse(started_at)`.
  - **AC-42:** a suite run, then a case run → list + `GET /eval/cases/:id` carry the case run's outcome. A further
    suite run → they carry the suite run's outcome.
  - **AC-43:** `GET /eval/runs/:id` → `scope:"case"`, `case_id`, `outcomes.length === 1`.
  - **AC-44:** a row inserted with Drizzle **without** `scope`/`caseId`, plus a new suite run, both read back as
    `scope:"suite"`, `case_id:null` (Spec follow-up 2).
  - **AC-45:**
    - insert 20 completed suite runs, 5 completed case runs newer than all of them, and 1 running case run;
    - `GET /agents/:id/eval/runs` → 21 items: the 20 suite runs, then the running case run; no finished case
      run.
  - **AC-46:** the same fixture → the dashboard `runs` holds the same 21 ids in the same order.
  - **AC-47:**
    - two completed suite runs, plus a newer completed case run with a failing outcome;
    - `trend` and `alert` equal what they were before the case run was inserted.
  - **AC-48:** an agent whose newest run is a case run shows its newest suite run as `latest_run`; with no suite
    run it shows `null`.
  - **AC-49:** a completed case run vs. a completed suite run of the same agent → 422 `not_suite_run`.
  - **NFR-4:** the second workspace's `GET /eval/runs/<owner's case run>` and
    `GET /eval/compare?a=<that>&b=<own>` → 404.
- **Files:** `server/test/eval-case-runs.it.test.ts`.
- **Done means:** `cd server && pnpm exec vitest run test/eval-case-runs.it.test.ts` is green with **0
  skipped**. Read the count (`server/INSIGHTS.md:31`).
- **Verify:** in `server/` with Docker up, run `pnpm exec vitest run test/eval-case-runs.it.test.ts`. Run that file
  directly: `verify.mjs --it` ignores file lists (`server/INSIGHTS.md:95`).
- **Rules that apply:**
  - The `.it.test.ts` suffix is required (root `CLAUDE.md`).
  - sec: cross-workspace 404s and no model call on a 404.
  - Pass explicit timestamps for ordered inserts (`server/INSIGHTS.md:79`).
- **Risk:** low.

### Lane L2a: client phase 1 (after L0; parallel with L1)

The client tests mock `fetch` or the hooks. They never need the L1 server.

#### W6: Pure run helpers, case-run hooks, `IconBtn.disabled`, and every new i18n key
- **Serves:** enables AC-3, AC-7 (cache insert), AC-10, AC-13, AC-16, AC-17, AC-19…AC-21, AC-23, AC-24, AC-25;
  NFR-1, NFR-5.
- **Do:**
  - **`client/src/lib/eval.ts`** (pure, type-only shared imports):
    - `suiteRunsOnly(runs: readonly EvalSuiteRun[]): EvalSuiteRun[]` → `scope === "suite"`;
    - `runningRunOf(runs)` → the `running` run of either scope, or `null`;
    - `runningCaseRunFor(runs, caseId)` → the running run with `scope === "case"` and `case_id === caseId`, or
      `null`.

    Add tests to `client/src/lib/eval.test.ts`.
  - **`client/src/lib/hooks/eval.ts`:**
    - **new `useStartCaseRun(agentId)`:**
      - `meta: { quietError: true }`;
      - `mutationFn: ({ caseId }: { caseId: string; afterSave: boolean }) => api.post<EvalRunStartResponse>(\`/eval/cases/${caseId}/runs\`)`;
      - `onSuccess` **returns** `Promise.all([invalidate runs(agentId), invalidate dashboard(agentId)])`. The
        mutation then stays pending until the runs list holds the running case run, which closes the double-start
        window for AC-8 and AC-21.
      - `onError: (err, vars) => notify.error(vars.afterSave ? t("caseRun.savedNotRun", { reason: t(runStartErrorKey(err)) }) : t(runStartErrorKey(err)))`.
        That is exactly one toast, with no raw code (AC-10, AC-23; Spec follow-up 3).
    - **extend `useEvalRun(runId, agentId?)`:** when `agentId` is given, call
      `useRefreshWhenRunSettles(agentId, data?.status === "running")`. A tracked case run settling then
      invalidates the cases, runs, dashboard and overview, so the modal's Last run line updates at that poll
      (AC-16). `useEvalRun` has no other caller today.
    - **`useCreateManualEvalCase.onSuccess(created)`:** first
      `qc.setQueryData<EvalCase[]>(evalKeys.cases(agentId), prev => [...(prev ?? []), created])`, then the
      existing invalidations. The new case is then in the list before any refetch (AC-7).
  - **`client/src/vendor/ui/primitives/IconBtn.tsx`:**
    - add an optional `disabled?: boolean`, passed to the `<button>`;
    - when it is set: no hover effect, `opacity: 0.4`, `cursor: "not-allowed"`;
    - the default render is unchanged.
  - **`client/messages/en/eval.json`**, the exact strings from NFR-1:
    - `caseModal.runCase` "Run case"
    - `caseModal.running` "Running…"
    - `caseModal.interrupted` "Run interrupted — try again"
    - `caseRun.savedNotRun` "Case saved; not run: {reason}"
    - `evalsTab.row.run` "Run"
    - `evalsTab.row.running` "Running" (the spinner label)
    - `runButton.runningCase` "Running case…"

    Existing keys are kept.
- **Files:** `client/src/lib/eval.ts`, `client/src/lib/eval.test.ts`, `client/src/lib/hooks/eval.ts`,
  `client/src/vendor/ui/primitives/IconBtn.tsx`, `client/messages/en/eval.json`.
- **Done means:**
  - `eval.test.ts` is green with the three helpers covered, including the AC-45 shape of 20 suite runs + 1
    running case run.
  - The client typecheck is green.
  - `IconBtn` without `disabled` renders the same attributes as before.
- **Verify:** `node scripts/verify.mjs client src/lib/eval.test.ts`
- **Rules that apply:**
  - FUA §5 ladder: pure rules in `lib/`, server data in `lib/hooks`.
  - FUA §7: keys are added with the strings.
  - `client/INSIGHTS.md:23`: `quietError` plus one toast.
  - FUA §1: `vendor/ui` stays domain-free (`IconBtn` learns only `disabled`).
- **Risk:** low.

#### W7: Suite run button "Running case…" and the dashboard detail's suite-only aggregates
- **Serves:** AC-24, AC-25 (dashboard detail).
- **Do:**
  - **`EvalRunButton.tsx`:** when `runningRun?.scope === "case"`, the label is `t("runButton.runningCase")`.
    Otherwise it is today's "Running k / N cases". It stays `loading` and disabled (`:41`). Update the header
    comment.
  - **`EvalAgentDetail.tsx`:**
    - `const suite = suiteRunsOnly(data.runs)`;
    - `runningRun` stays `runningRunOf(data.runs)`, the either-scope run that drives AC-24 through `DetailHeader`;
    - `runCount`, `metricCardData(…)`, the selection's `runIds`, the empty state and `RunsTable` all read `suite`
      (AC-25).
  - **Tests:**
    - `EvalRunButton.test.tsx`: a running run with `scope:"case"` and `cases_total: 1` renders "Running case…",
      not "Running 0 / 1 cases", and the button is disabled.
    - `EvalAgentDetail.test.tsx`: **add** tests and do not edit existing ones:
      - a dashboard whose `runs` hold a running case run next to suite runs renders no extra table row and
        unchanged cards;
      - the button reads "Running case…".
- **Files:** `client/src/components/EvalRunButton/{EvalRunButton.tsx, EvalRunButton.test.tsx}`,
  `client/src/app/eval/[agentId]/_components/EvalAgentDetail/{EvalAgentDetail.tsx, EvalAgentDetail.test.tsx}`.
- **Done means:** both test files are green, and the existing tests in them pass unedited.
- **Verify:**
  - `node scripts/verify.mjs client src/components/EvalRunButton/EvalRunButton.test.tsx`
  - `cd client && pnpm exec vitest run EvalAgentDetail CompareRunsModal EvalOverview`
- **Rules that apply:** FUA §5 (derive, never copy server data into state); react (no derived state).
- **Risk:** low.

#### W8: Evals tab: row ▶ Run, the running spinner, disabled rows, and suite-only aggregates
- **Serves:** AC-19, AC-20, AC-21, AC-22, AC-23, AC-25 (Evals tab), NFR-2 (row), NFR-5.
- **Do:**
  - **`EvalsTab.tsx`:**
    - `const suite = suiteRunsOnly(allRuns)`. `latestAndPrevious(suite)`, the "k / N passing" badge, `<MetricTrend runs={suite} …/>`
      and `<RunHistory runs={suite} />` all read it (AC-25).
    - `runningRun = runningRunOf(allRuns)`, of either scope, goes to `EvalRunButton`.
    - `const startCase = useStartCaseRun(agent.id)`. A `rowStarting` ref guards against a double click: one POST
      per click burst (AC-21).
    - Each row gets:
      - `onRun={() => start(c.id)}`, which calls `startCase.mutate({ caseId, afterSave: false }, { onSettled: release })`;
      - `runDisabled={!!runningRun || startCase.isPending}` (AC-20);
      - `running={runningRun?.scope === "case" && runningRun.case_id === c.id}` (AC-22).
    - The row Run never calls `setOpenId` (AC-21).
  - **`EvalCaseRow.tsx` + `styles.ts`:**
    - New props: `onRun`, `runDisabled`, `running`.
    - Inside the existing `stopPropagation` span, **before** Edit, add
      `<IconBtn icon="Play" label={t("evalsTab.row.run")} size={26} onClick={onRun} disabled={runDisabled} />`
      (AC-19, `components2.jsx:55`). The span already stops the click from reaching the row's open handler
      (NFR-2).
    - When `running` is true, render `Icon.RefreshCw` in place of the status icon, with `role="img"`,
      `aria-label={t("evalsTab.row.running")}` and `animation: "ddspin 1s linear infinite"` (keyframe at
      `vendor/ui/styles.css:235`). Use a `s.spinner` style with `color: "var(--accent)"`.
    - Rewrite the header comment, which says "There is deliberately NO Run button".
  - **`EvalsTab.test.tsx`:**
    - extend the fetch mock with `POST …/eval/cases/<id>/runs`;
    - **AC-19:** every row's buttons read "Run", "Edit", "Delete" in that order (`within(listitem)`);
    - **AC-20:** with a running suite run, and with a running case run, every row Run is disabled;
    - **AC-21:** one click and a double click each record exactly one run POST, and `nav.replace` was never
      called with `case=`;
    - **AC-22:** the running case's row shows the "Running" image and the others keep their status icons;
    - **AC-23:** 409 `run_in_progress`, 422 `provider_key_missing` and 429 each raise one toast with the English
      text and no raw code. Query by accessible name (`client/INSIGHTS.md:59`).
    - **AC-25:** a running case run next to suite runs adds no RunHistory row and no trend point, and leaves the
      cards and badge unchanged;
    - **NFR-2:** the row Run is a native `button`, and `focus()` lands on it. A click on the focused element starts
      a run and opens no modal (Spec follow-up 1).
- **Files:** `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx}`, `…/EvalsTab/_components/EvalCaseRow/{EvalCaseRow.tsx, styles.ts}`.
- **Done means:**
  - `EvalsTab.test.tsx` is green, including the SPEC-04/05 tests.
  - `grep -nE "#[0-9a-fA-F]{3,6}\b|rgb\(" ` over the changed `styles.ts` / `.tsx` files finds nothing (NFR-5).
- **Verify:** `cd client && pnpm typecheck && pnpm exec vitest run EvalsTab` (name filter; `client/INSIGHTS.md:28`).
- **Rules that apply:**
  - FUA §3: the row renders and triggers events, and the start lives in the tab.
  - react: `{count > 0 && …}` style; no `renderThing()`.
  - RTL: role + name queries. The label "Run" also appears in "Run all evals (N cases)", so use
    `{ name: "Run" }` exact matching scoped `within` a row.
- **Risk:** low.

### Lane L2b: client phase 2 (after L2a; still parallel with L1)

#### W9: Run case in the case modal: edit mode, run tracking and the Last run states
- **Serves:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-8 (PATCH path), AC-9 (PATCH path), AC-10, AC-12, AC-13, AC-14,
  AC-15, AC-16, AC-17, NFR-1, NFR-2 (modal), NFR-5.
- **Do:**
  - **Footer** (`EvalCaseModal.tsx:139-148`): Cancel (ghost), then
    `<Button kind="secondary" icon="Play" loading={ownRunning} disabled={!canRunCase} onClick={runCase}>{t("caseModal.runCase")}</Button>`,
    then Save. The order and kinds are `screen_cizruns.jsx:63-65`. Render no "Run on save" toggle. The buttons
    show in all three modes (AC-1).
  - **Run tracking**, all derived:
    - `runs = useEvalRuns(agentId)`, the tab's cache, so no extra fetch;
    - `anyRunning = !!runningRunOf(runs.data ?? [])`;
    - `listOwn = evalCase ? runningCaseRunFor(runs.data ?? [], evalCase.id) : null`.
    - `trackedRunId` (state) is set from the 202's `run_id`. When it is still null and `listOwn` exists, adopt
      `listOwn.id` during render: the React "adjust state while rendering" pattern, not an effect.
    - `own = useEvalRun(trackedRunId, agentId)`.
    - `ownRunning = listOwn !== null || (trackedRunId !== null && (own.data === undefined || own.data.status === "running"))`.
    - `interrupted = own.data?.status === "failed" && own.data.error_reason === "interrupted"`.
  - **Gate** (AC-2, AC-3, AC-14): `canRunCase = <the same conditions as canSave> && !anyRunning && !startCase.isPending && !runInFlight.current`.
    Factor the shared Save conditions into one pure function in `helpers.ts`, `saveBlocked(...)`, so Save and Run
    case cannot drift. `canSave` itself stays independent of any run (AC-15).
  - **`runCase()` in edit mode:**
    1. A `runInFlight` ref guard (AC-8).
    2. `patch = buildPatch(...)` as in `save()`.
    3. If there is a patch, `await update.mutateAsync({ id, patch })`. On a rejection, stop: the hook already showed
       one toast, and the fields are untouched (AC-4, AC-9). **Never** call `onClose` on this path (AC-12).
    4. `const res = await startCase.mutateAsync({ caseId: evalCase.id, afterSave: patch !== null })`, then
       `setTrackedRunId(res.run_id)` (AC-5, AC-10).
    5. Catch the rejection: the hook toasted it.
    6. Release the guard in `finally`.
  - **New child `_components/LastRunLine/`** (`LastRunLine.tsx`, `styles.ts`, `index.ts`). It takes the existing
    Last run rendering out of the modal (`EvalCaseModal.tsx:102-118, 200-205`) and adds two states:
    - `ownRunning` → "Running…" (AC-13);
    - `interrupted` → "Run interrupted — try again" (AC-17);
    - else the existing variants from `evalCase.last_outcome` (AC-16).

    Its styles reuse the `s.lastRun(tone)` tokens; no hex values.
  - **Modal header comment:** rewrite "There is no Files tab and no per-case Run" (`:6`).
  - **`EvalCaseModal.test.tsx`** (hooks mocked):
    - add `useEvalRuns`, `useEvalRun` and `useStartCaseRun` to the `vi.mock("@/lib/hooks/eval")` factory (`:12-15`);
    - AC-1: order and kinds in the three modes, and no toggle;
    - AC-2: each disabling condition, with the existing SPEC-05 fixtures;
    - AC-3: a running suite run, and a running case run of another case;
    - AC-13 / AC-14: own running case run → "Running…", no "Last run …", and the button carries the loading state
      and is disabled;
    - AC-15: Save stays enabled and sends the PATCH.
  - **`EvalCaseModal.requests.test.tsx`** (real hooks, `fetch` mocked):
    - AC-4: request order PATCH → POST run, and no POST after a failing PATCH;
    - AC-5: exactly one request;
    - AC-8: a double click → one PATCH + one POST;
    - AC-9: a 422 PATCH → no POST, one toast, fields unchanged;
    - AC-10: `run_in_progress` / `provider_key_missing` / 429 after a PATCH → one toast "Case saved; not run: …"
      with the mapped text;
    - AC-12: the dialog is still rendered after the 202.
    - **AC-16:** `vi.useFakeTimers()`. The run mock turns `running` → `completed`, and the case GET carries the new
      outcome. After advancing 3000 ms the line reads "Last run passed · …". An errored outcome reads "Last run
      errored · timeout".
    - **AC-17:** the run turns `failed: interrupted` → the message shows, and "Run case" is enabled.
    - Use `{ ignore: "textarea, script, style" }` on text queries that must not match textarea content
      (`client/INSIGHTS.md:60`).
- **Files:** `…/EvalCaseModal/{EvalCaseModal.tsx, helpers.ts, styles.ts, EvalCaseModal.test.tsx, EvalCaseModal.requests.test.tsx}`,
  `…/EvalCaseModal/_components/LastRunLine/{LastRunLine.tsx, styles.ts, index.ts}`.
- **Done means:**
  - Both modal test files are green, with one test per AC under Serves, and the SPEC-05 tests in them still pass.
  - No hex / `rgb(` in the changed files (NFR-5).
  - `EvalCaseModal.tsx` keeps a single job: composition plus handlers. The Last-run rendering lives in
    `LastRunLine`.
- **Verify:** `cd client && pnpm typecheck && pnpm exec vitest run EvalCaseModal`
- **Rules that apply:**
  - react: derive, don't store (the override pattern, `EvalCaseModal.tsx:11-15`); no `useEffect` for derived run
    state; no component defined in render.
  - FUA §3: split off `LastRunLine`.
  - FUA §5: server data from hooks.
  - `client/INSIGHTS.md:23`: no second toast from the component.
- **Risk:** medium. The modal now has three async paths, plus run tracking across a re-mount.

#### W10: Run case in create mode, the create → edit hand-off, and the row update after closing mid-run
- **Serves:** AC-6, AC-7, AC-8 (create path), AC-9 (create path), AC-11, AC-18 (EC-22, EC-24).
- **Do:**
  - **`EvalCaseModal` props:** the create variant gains `onCreated: (caseId: string) => void`.
  - **`runCase()` in create mode:**
    1. The same `runInFlight` guard; it also covers the existing `creating` ref (AC-8).
    2. `const created = await create.mutateAsync(body)`. On a rejection, stop: one toast, fields kept, no run POST
       (AC-9).
    3. `try { await startCase.mutateAsync({ caseId: created.id, afterSave: true }) } catch {}`, so a rejection has
       already toasted "Case saved; not run: …" (AC-6, AC-10).
    4. **`finally` → `onCreated(created.id)`.** The hand-off happens whether the start was accepted or rejected
       (AC-7, AC-11).

    W6's cache insert puts the case in the list first. The edit modal mounts on `?case=<id>`, adopts the running
    case run from the runs list (W9), and shows the **stored** name, so a suffixed name such as `-2` is what it
    shows (EC-24).
  - **`EvalsTab.tsx`:** pass `onCreated={(id) => { setCreating(false); setOpenId(id); }}` to the create modal. A
    second "Run case" in the edit modal then sends only `POST /eval/cases/<id>/runs` (AC-11).
  - **`EvalCaseModal.requests.test.tsx`:**
    - AC-6: the request order is `POST /agents/ag1/eval/cases`, then `POST /eval/cases/<new id>/runs` with the id
      from the 201;
    - AC-8: a double click → one create + one run POST;
    - AC-9: a 422 create → no run POST, one toast, fields kept.
  - **`EvalsTab.test.tsx`:**
    - Make `nav.replace` write back into `nav.search` and rerender. The URL then drives the edit modal, as
      `EvalsTab.tsx:45-52` reads it.
    - **AC-7:** after the mocked 201 (+202), `nav.search` has `case=<new id>`, and the dialog title is "Eval case
      · <stored name>". The case row is present while the cases refetch is still pending: hold that fetch on a
      deferred promise.
    - **AC-11:** 201 then 409 → the dialog is in edit mode for the new id. Clicking "Run case" again sends only
      the run POST, with no second create.
    - **AC-18:**
      1. In the edit modal, start a run (202), and the runs mock returns the running case run.
      2. Close the dialog.
      3. The runs mock returns no running run (finished case runs are not listed), and the cases mock carries the
         new `last_outcome`.
      4. Advance the poll: the row's status icon and result line change, and no toast appears.
- **Files:** `…/EvalCaseModal/{EvalCaseModal.tsx, EvalCaseModal.requests.test.tsx}`, `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx}`.
- **Done means:**
  - Both test files are green.
  - `node scripts/verify.mjs client` (the full client suite) is green. This is L2's lane-level run.
- **Verify:** `cd client && pnpm exec vitest run EvalCaseModal EvalsTab && cd .. && node scripts/verify.mjs client`
- **Rules that apply:**
  - FUA §5: the open/created state is local, and the case id goes into the URL as today (`EvalsTab.tsx:5-8`).
  - react: no effect chain for the hand-off; it happens in the event handler.
  - RTL: "New eval case" and "Run case" labels are scoped `within(getByRole("dialog"))` (`client/INSIGHTS.md:58`).
- **Risk:** medium. The hand-off ordering is easy to get subtly wrong; AC-7/AC-11 pin it.

### Lane L3: integration (main session, after L1 and L2b)

#### W11: `verify:l06`, full verification, cross-lane checks
- **Serves:** NFR-5 (manual), and the whole-tree gate for every AC above.
- **Do:**
  1. **`server/package.json`:** append `test/eval-case-run.test.ts test/eval-case-runs.it.test.ts` to the
     `verify:l06` script (`:18`). Edit this one line; do not run `pnpm install`.
  2. Run the full **Verification plan** below.
  3. **Cross-lane checks:**
     - both vendor copies are identical (the sync tests);
     - the client hook's `POST /eval/cases/:id/runs` (W6) matches the route (W3): path, no body, 202 shape.
  4. **Manual smoke on the dev stack** (`./scripts/dev.sh`, or restart the API so `tsx watch` picks up the
     module; migration 0022 was applied in W2). On an agent's Evals tab:
     - click a row's ▶ Run: the spinner shows, every Run is disabled, and the suite button reads "Running case…";
     - the row turns green/red with no toast;
     - edit a case and click "Run case": the modal stays open, "Running…" shows, then "Last run …";
     - in create mode, "Run case" hands off to `?case=<id>`;
     - `/eval/<agentId>` shows no case-run row in Recent runs once it finishes.
  5. **NFR-5:** compare the footer and rows with `screen_cizruns.jsx:61-65` and `components2.jsx:54-57`. Run
     `grep -nE "#[0-9a-fA-F]{3,6}\b|rgb\("` over every client file L2 touched.
- **Files:** `server/package.json` (one line).
- **Done means:** every row of the Verification plan passes as stated. The smoke steps behave as listed.
- **Verify:** the Verification plan table.
- **Rules that apply:** sec (`**/package.json` is routed). No dependency change.
- **Risk:** low.

---

## Execution

| Lane | Executor | Work items | Files (disjoint across parallel lanes) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| L0: contracts + DB | implementer | W1, W2 | both `vendor/shared/contracts/eval-ci.ts`; `server/src/db/schema/eval.ts`, migration `0022_*` + `meta/`; `server/src/modules/eval/helpers/dto.ts`; `server/test/eval-contracts.test.ts` + fixture fixes in existing `server/test/eval-*.it.test.ts`; `client/src/lib/eval.ts` (one key), `client/messages/en/eval.json` (one key), `EvalsTab.test.tsx` + `MetricTrend.test.tsx` (factories only) | — | — | **runs alone**: `pnpm db:generate` rewrites `migrations/meta`, and `pnpm db:migrate` touches the dev DB |
| L1: server | implementer | W3, W4, W5 | `server/src/modules/eval/{constants.ts, repository.ts, service.ts, routes.ts}`; `server/test/{eval-manual-run.test.ts (fake only), eval-case-run.test.ts, eval-case-runs.it.test.ts}` | L0 | L2a, L2b | shared tree (server only) |
| L2a: client, phase 1 | implementer | W6, W7, W8 | `client/src/lib/{eval.ts, eval.test.ts, hooks/eval.ts}`; `client/messages/en/eval.json`; `client/src/vendor/ui/primitives/IconBtn.tsx`; `client/src/components/EvalRunButton/*`; `…/EvalAgentDetail/{EvalAgentDetail.tsx, EvalAgentDetail.test.tsx}`; `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx}`; `…/EvalCaseRow/*` | L0 | L1 | shared tree (client only) |
| L2b: client, phase 2 | implementer | W9, W10 | `…/EvalCaseModal/**` (incl. new `_components/LastRunLine/`); `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx}` | L2a (shares `EvalsTab.tsx`, `EvalsTab.test.tsx`) | L1 | shared tree (client only) |
| L3: integration | main session | W11 | `server/package.json` (one line) | L1, L2b | — | whole tree |

Schedule: **L0 → { L1 ∥ (L2a → L2b) } → L3**.

- L0 shares a few files with the later lanes: client `lib/eval.ts`, `eval.json` and `EvalsTab.test.tsx`. Those
  overlaps are **serialized** by the explicit dependency. No two **parallel** lanes share a file, because L1
  is server-only and L2 is client-only.
- L1's integration tests use Docker; L2 does not. Do not run `node scripts/verify.mjs server --it` while L1's
  agent is still running integration files (`server/INSIGHTS.md:95`). The full `--it` lane runs only at L3.
- Each executor is dispatched with this plan's path **and its lane id**. L2a and L2b are separate dispatches. Each
  executor touches only its lane's files.
- No lane commits. Commits follow `docs/git-workflow.md`, and only when the user asks.

---

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | typecheck clean · unit suite green (a red test is a regression until proven otherwise; `brief-budget-cost.test.ts` is a known load flake, `server/INSIGHTS.md:36`) · arch:check no new violation |
| `node scripts/verify.mjs server --it` | repo root | — | integration lane green with Docker up, **0 skipped** (`server/INSIGHTS.md:31`); run it only when no other agent is using Docker |
| `pnpm verify:l06` | `server/` | pnpm | exits 0 with Docker up; includes the two new SPEC-07 files (after W11 step 1) |
| `node scripts/verify.mjs client` | repo root | — | typecheck clean · full unit suite green |
| `node scripts/verify.mjs specs` | repo root | — | specs guard green (cheap; `specs/` holds uncommitted orchestrator changes) |
| `pnpm build` (optional) | `client/` | pnpm | builds. Run it only with `pnpm dev` stopped, then `rm -rf client/.next` and restart dev (`client/INSIGHTS.md:26,46`). |

---

## Assumptions

- **A1:** The table name stays `eval_suite_runs`, and the contract name stays `EvalSuiteRun`. A case run is a row
  of it with `scope = 'case'`. Renaming either would churn every consumer and every past plan for no behaviour
  gain. The spec's Contracts block keeps the `EvalSuiteRun` name too.
- **A2:** `case_id` has **no** foreign key, so deleting the case must leave the run intact (AC-40). The run's
  `case_ids` jsonb holds `[case_id]` too, so code that reads `case_ids` needs no special case.
- **A3:** The `(scope = 'case') = (case_id IS NOT NULL)` invariant is a DB CHECK, not a Zod `.refine`. A refine
  would wrap `EvalSuiteRun` in `ZodEffects` inside three other schemas.
- **A4:** No new index. Today's `(agent_id, started_at desc)` index (`schema/eval.ts:94`) serves the filtered
  list; the scope predicate is a residual filter on a per-agent row set that holds at most a few hundred rows.
- **A5:** The running case run is appended **after** the suite runs in the list and the dashboard (AC-45's
  wording). The client never relies on that position: every client consumer either filters it out with
  `suiteRunsOnly` or finds it with `runningRunOf`.
- **A6:** The modal follows its own case run through `GET /eval/runs/:id`, as the spec's boundary table says,
  and adopts a run the list shows for its case. A finished case run leaves the runs list, so only the run read
  can report `failed: interrupted` (AC-17).
- **A7:** `useStartCaseRun.onSuccess` returns the invalidation promise. TanStack keeps the mutation pending until
  that promise settles, which keeps the buttons disabled until the runs list shows the running run.
- **A8:** In create mode, the hand-off to the edit modal happens after the run-start request settles, whether it
  was accepted or rejected. This satisfies AC-7 and AC-11 together, and the start request is never issued from
  an unmounting component.
- **A9:** No new npm dependency is needed in any package.

## Open questions

None.

## Research used

None. No `researcher` was dispatched; every fact above was read from the repo:
- drizzle `check` is already imported and used (`schema/eval.ts:13,60`);
- the hooks mock (`EvalCaseModal.test.tsx:12-15`);
- `IconBtn` has no `disabled` (`IconBtn.tsx:4-18`);
- the seed writes no runs (grep of `server/src` for `evalSuiteRuns`).

## Rollback / blast radius

- **Files:** reverting the files restores SPEC-05 behaviour. The new endpoint and UI are additive. The changed
  read paths (run list, dashboard, overview, compare) revert with them.
- **Migration 0022 is not reverted by reverting files.** The `scope`/`case_id` columns and the CHECK stay in the
  DB. To remove them:
  1. Delete case runs first: `DELETE FROM eval_suite_runs WHERE scope = 'case'`. Their outcomes cascade
     (`schema/eval.ts:110`), which also drops those outcomes from every case's `last_outcome`.
  2. Revert the schema.
  3. Run `pnpm db:generate` (a drop-only pass, so no rename prompt) and `pnpm db:migrate`.
- **Never run `docker compose down -v`** (root `CLAUDE.md`).
- Seeded data is untouched.
