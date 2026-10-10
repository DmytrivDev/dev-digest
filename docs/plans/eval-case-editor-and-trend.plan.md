# Implementation plan: Eval Case Editor (manual cases) and the Evals-tab metric trend

**Route**: A (spec-driven).
**Requirements source**: `specs/SPEC-05-eval-case-editor-and-trend.md` (Status: approved; 0
`[NEEDS CLARIFICATION]` markers; the specs guard is green). This plan implements those requirements. It does
not define them and it does not change them.
**Builds on**: the SPEC-04 implementation (`docs/plans/eval-pipeline.plan.md`). Names, module layout and test
conventions follow that plan. Nothing here re-derives it.
**Execution mode**: multi-agent, chosen by the user on 2026-10-08. The schedule is
**L1 (contracts + DB) → { L2 server ∥ L3 client }**. L3 runs as two sequential phases, L3a → L3b, so that each
run stays short.
**Branch**: the current working branch (`lesson-06`). This plan does not create a branch.
**Out of scope**:
- every Non-goal in the spec (`specs/SPEC-05-eval-case-editor-and-trend.md:64-96`): per-case runs, Run on save,
  the Files tab, multi-file cases, Linked issue, PR number on manual cases, skill-owned cases, expectation form
  fields, editing a finding-born case's input, trend thresholds, more than 20 runs, dashboard changes beyond the
  tooltip, discard confirmation, URL-addressable create mode, a seeded manual case, secret scanning, a per-route
  rate limit, URL/PR import;
- **SPEC-06 territory, which a parallel lane owns.** No SPEC-05 lane touches `.claude/**`, `evals/**`,
  `server/stryker*`, the mutation script, `server/test/eval-scoring.test.ts`, `server/package.json` or
  `server/pnpm-lock.yaml`. See "Shared-file risk with SPEC-06".

Architecture review and security review are done by separate agents.

---

## Requirements traceability

Line numbers are `specs/SPEC-05-eval-case-editor-and-trend.md:<line>`.

| Req | Requirement (short) | Source | Work items | Checked by |
|---|---|---|---|---|
| AC-1 | primary "New eval case" + `Plus` after the run button | :120 | W8, W10 | W10 EvalsTab test |
| AC-2 | button enabled with 0 cases / no run / a running run | :126 | W10 | W10 EvalsTab test |
| AC-3 | create-mode modal parts; absent parts | :133 | W8, W9 | W9 EvalCaseModal test |
| AC-4 | editable mono textarea + placeholder naming `+++ b/<path>` and `@@` | :147 | W8, W9 | W9 test |
| AC-5 | preview through the shared diff viewer, new-side numbers, no "+" affordance | :152 | W8, W9 | W8 lib test + W9 test |
| AC-6 | header lines not rendered as added/removed | :159 | W8, W9 | W8 lib test + W9 test |
| AC-7 | first failing diff check message, in order; empty → nothing | :164 | W8, W9 | W8 lib test + W9 test |
| AC-8 | PR meta Title/Body editable, no PR number / Linked issue | :173 | W9 | W9 test |
| AC-9 | Finding skeleton text (first added, else first context line) | :177 | W8, W9 | W8 lib test + W9 test |
| AC-10 | skeleton disabled: empty / unparseable / no new-side line | :184 | W8, W9 | W9 test |
| AC-11 | inline `file_mismatch` / `range_outside_hunks` under the pane | :189 | W8, W9 | W8 lib test + W9 test |
| AC-12 | client verdict == server verdict on one fixture list | :197 | W3, W4, W8 | `eval-paste-diff.test.ts` (server) + `eval-case-diff.test.ts` (client), same JSON |
| AC-13 | Save gate (name, diff, expectation, pending) | :212 | W9 | W9 test |
| AC-14 | one create request on a double click; "Saving…" | :220 | W8, W9 | W9 test |
| AC-15 | modal closes after 201 | :224 | W9 | W9 test |
| AC-16 | new row + "Run all evals (N+1 cases)" with no reload | :227 | W8, W10 | W10 EvalsTab test |
| AC-17 | failed create/update → fields kept + one mapped toast | :231 | W8, W9 | W8 lib test + W9 test |
| AC-18 | Cancel / Escape → close, no request, no confirm | :239 | W9 | W9 test |
| AC-19 | POST creates in the agent's suite, 201 `EvalCase` | :245 | W5, W6 | `eval-manual-cases.it.test.ts` |
| AC-20 | `origin: "manual"`, `source: null`, `labels: null` | :250 | W1, W2, W3, W5 | it test |
| AC-21 | `input_meta` of a manual case (null pr, title "", body null) | :254 | W1, W5 | it test |
| AC-22 | stored diff = `diff --git`/`---`/`+++` + pasted hunks | :262 | W4 | `eval-paste-diff.test.ts` |
| AC-23 | CRLF stored as LF | :269 | W4 | `eval-paste-diff.test.ts` |
| AC-24 | name collision `-2`, `-3`, ≤ 60 chars | :274 | W5, W6 | it test |
| AC-25 | 422 + first failing diff code, in order; no row | :280 | W4, W5, W6 | unit + it test |
| AC-26 | 422 `file_mismatch` on create | :291 | W5, W6 | it test |
| AC-27 | 422 `range_outside_hunks` on create; context line accepted | :295 | W5, W6 | it test |
| AC-28 | 422 `validation_error`: unknown key, name, meta size, NUL | :301 | W1, W5, W6 | `eval-manual-contracts.test.ts` + it test |
| AC-29 | 404 for an agent outside the workspace; no row | :310 | W5, W6 | it test |
| AC-30 | create/update make no model call | :315 | W5, W7 | `eval-manual-run.test.ts` |
| AC-31 | manual case opens editable with preview, checks, skeleton | :321 | W9 | W9 test |
| AC-32 | finding-born case stays read-only, no skeleton | :327 | W9 | W9 test |
| AC-33 | "Created manually" source line | :332 | W8, W9 | W9 test |
| AC-34 | manual edit sends only changed fields; no change → no request | :336 | W8, W9 | W8 lib test + W9 test |
| AC-35 | manual update stores a new diff/meta, normalised | :344 | W5, W6 | it test |
| AC-36 | `diff_frozen` on a finding-born case; nothing changes | :348 | W5, W6 | it test |
| AC-37 | update with a bad diff → first failing code; unchanged | :353 | W5, W6 | it test |
| AC-38 | resulting diff + expectation checked on update | :358 | W5, W6 | it test |
| AC-39 | PATCH from another workspace → 404; unchanged | :365 | W5, W6 | it test |
| AC-40 | mid-run edit does not reach the running run | :370 | W7 | `eval-manual-run.test.ts` |
| AC-41 | "manual" badge in place of severity · category | :377 | W8, W10 | W10 EvalsTab test |
| AC-42 | finding-born cases (incl. pre-existing) report `origin: "finding"` | :382 | W2, W3, W6 | it test |
| AC-43 | manual cases counted everywhere | :387 | W6 | it test |
| AC-44 | manual case runs and scores like a finding-born one | :394 | W7 | `eval-manual-run.test.ts` |
| AC-45 | manual task line: fixed words, no number, no user text | :399 | W4, W7 | `eval-manual-run.test.ts` |
| AC-46 | title/body only in the PR-description slot | :404 | W4, W7 | `eval-manual-run.test.ts` |
| AC-47 | no title and no body → no PR description | :410 | W4, W7 | `eval-manual-run.test.ts` |
| AC-48 | a case created mid-run leaves the run unchanged | :414 | W6 | it test |
| AC-49 | EmptyState names both sources | :419 | W8, W10 | W10 EvalsTab test |
| AC-50 | "Metric trend" card below EVAL METRICS; 3 lines, colours, legend | :425 | W11, W12 | W12 MetricTrend/EvalsTab test |
| AC-51 | one dotted point per completed run, chronological | :433 | W12 | W12 test |
| AC-52 | 0–1 domain, ticks 0…1 step 0.2 | :438 | W11, W12 | W12 test |
| AC-53 | a null metric is a gap (null, not 0) | :442 | W11, W12 | W11 LineChart test + W12 test |
| AC-54 | tooltip: date, `v<n>`, cost, three whole % / n/a | :447 | W8, W11, W12 | W11 EvalTrendChart test + W12 test |
| AC-55 | < 2 completed → one-line hint, no chart | :457 | W12 | W12 test |
| AC-56 | a polled completion adds the point | :461 | W12 | W12 test |
| AC-57 | runs load error → one-line error, no chart | :465 | W12 | W12 test |
| AC-58 | LineChart without the tooltip option renders as before | :471 | W11 | W11 LineChart test + existing tests unchanged |
| AC-59 | dashboard point hover/focus → AC-54 tooltip | :476 | W1, W3, W11 | W11 dashboard TrendChart test |
| AC-60 | dashboard trend unchanged otherwise | :480 | W11 | `EvalAgentDetail.test.tsx` passes **byte-unchanged** |
| NFR-1 | every new string from `messages/en/eval.json` | :532 | W8 (+ W9–W12 consume) | component tests assert English text |
| NFR-2 | keyboard operability; chart focus + arrows | :537 | W9, W10, W11, W12 | component tests (see Spec follow-up 1) |
| NFR-3 | pasted/typed text and tooltip values rendered as text | :546 | W9, W11 | W9 + W11 tests (`<img onerror>` sentinel) |
| NFR-4 | manual diff/body only inside untrusted delimiters, escaped | :552 | W7 | `eval-manual-run.test.ts` |
| NFR-5 | `@devdigest/ui` primitives + tokens, no hex/`rgb(` | :558 | W9–W12, Integration | manual compare + grep at integration |
| NFR-6 | 200 KB diff + 200 KB meta in one request → 201 | :565 | W1, W5, W6 | it test |
| NFR-7 | 200 KB paste previews within 1 s | :570 | W8, W9, Integration | manual (browser performance panel) |

Every AC and NFR maps to at least one work item, and every work item appears in at least one row.

---

## Spec follow-ups

These are addressed to `spec-creator` and the user. None of them is applied: this plan implements the spec as
written.

1. **NFR-2 "tabbing reaches each control" cannot be simulated as worded.** The client has no
   `@testing-library/user-event` (`client/INSIGHTS.md:55`), and a jsdom `fireEvent` Tab does not move focus.
   SPEC-04 hit the same limit (`docs/plans/eval-pipeline.plan.md:164-166`). The plan checks it this way:
   - every new control is a native `button`/`textarea`/`input` with no `tabIndex={-1}`, and `focus()` lands on
     it;
   - the chart wrapper has `tabIndex={0}`;
   - ArrowRight/ArrowLeft on the focused chart move the tooltip (this part is simulated).

   The spec could word the check as "every control is natively focusable".
2. **AC-25 "more than one file, counting both `diff --git` and `+++` headers"** reads naturally as
   "count = max(#`diff --git`, #`+++ `)". The plan implements that reading (Assumption A3), and both packages
   share one fixture list. The spec could state the formula.
3. **AC-5's gutter vs. a trailing `\ No newline at end of file`.** The shared diff viewer's `parsePatch`
   (`client/src/components/diff-viewer/helpers.ts:12-38`) numbers that marker line as context. The preview
   therefore drops `\` marker lines before rendering (Assumption A5). Stored diffs keep them. The spec says
   nothing either way.
4. **EvalTrendPoint's new fields are optional on the wire.** AC-60 demands that the existing dashboard tests
   pass *unchanged*. `client/src/app/eval/[agentId]/_components/EvalAgentDetail/EvalAgentDetail.test.tsx:62`
   builds typed `EvalTrendPoint` fixtures, and the client typecheck covers tests (`client/tsconfig.json:33`).
   Required fields would force an edit to that file. The server always sends the fields (Assumption A7).

None of these is a blocker.

---

## Shared-file risk with SPEC-06 (parallel lane)

| File | SPEC-06 | SPEC-05 | Handling |
|---|---|---|---|
| `server/package.json` | edits (devDeps, Stryker scripts) | **only** the `verify:l06` script line, at Integration | No SPEC-05 lane edits it. The main session appends the new SPEC-05 test files to `verify:l06` **after the SPEC-06 lane has landed**, in one edit. |
| `server/pnpm-lock.yaml` | changes (new devDeps) | **never** | SPEC-05 needs **no new dependency** in any package. `recharts@^2.15`, `zod`, `drizzle-kit` and the diff viewer are already present. `client/package.json` and the lock files stay untouched. |
| `server/test/eval-scoring.test.ts` | edits | **never** | New SPEC-05 scoring checks (AC-44) live in the new `server/test/eval-manual-run.test.ts`. If a SPEC-05 contract change breaks this file, the lane **stops and reports**; it does not edit the file. |
| `.claude/**`, `evals/**`, `server/stryker*`, the mutation script | owns | never | — |

Decision on `verify:l06`: **yes**, the new server test files join it. They are `eval-manual-contracts.test.ts`,
`eval-paste-diff.test.ts`, `eval-manual-run.test.ts` and `eval-manual-cases.it.test.ts`. The change is
SPEC-05's part of the L06 gate, and Integration applies it.

---

## Affected surface

Skills come from `.claude/skill-routing.md`. Abbreviations: OA = onion-architecture, FUA =
frontend-ui-architecture, sec = security, fastify = fastify-best-practices, drizzle = drizzle-orm-patterns,
pg = postgresql-table-design, react = react-best-practices, next = next-best-practices,
RTL = react-testing-library.

### L1: contracts + DB

| File | New/Mod | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|
| `server/src/vendor/shared/contracts/eval-ci.ts` | Mod | ring 2 | zod | byte-identical twin in client (`server/INSIGHTS.md` vendor-sync entry; `server/test/vendor-shared-sync.test.ts`); section order is load-bearing at import time |
| `client/src/vendor/shared/contracts/eval-ci.ts` | Mod | vendored ring 2 | zod | same bytes as the server copy (`client/src/test/vendor-shared-sync.test.ts`) |
| `server/src/db/schema/eval.ts` | Mod | ring 4 | drizzle, pg | `source_pr_number`/`source_repo`/`labels` are NOT NULL today (`eval.ts:37-39`) |
| `server/src/db/migrations/0021_<generated>.sql` + `meta/*` | New (generated) | ring 4 | pg | `pnpm db:generate` only; never hand-written (root `CLAUDE.md`) |
| `server/src/modules/eval/helpers/dto.ts` | Mod | ring 1 mapper | OA | Ban 3: snake_case DTO out; `origin` decides null `source`/`labels` |
| `server/src/modules/eval/service.ts` | Mod (dashboard trend mapping only) | ring 3 | OA | `service.ts:449-454` builds `trend` |
| `server/test/eval-manual-contracts.test.ts` | New | test | — | joins `verify:l06` at Integration |
| `server/test/fixtures/eval-case-diff-parity.json` | New | test fixture | — | the single AC-12 fixture list, read by both packages |
| `server/test/{eval-contracts.test.ts, eval-executor.test.ts, eval-cases.it.test.ts, eval-runs.it.test.ts, eval-compare.it.test.ts}` | Mod (fixtures only, if they break) | test | — | server typecheck EXCLUDES `server/test`, so breakage shows only at runtime. Grep them. |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/EvalCaseRow/EvalCaseRow.tsx` | Mod (null-safety only) | route-local | FUA, react | `labels` becomes nullable |
| `…/EvalsTab/_components/EvalCaseModal/EvalCaseModal.tsx` | Mod (null-safety only) | route-local | FUA, react | `source` becomes nullable (`EvalCaseModal.tsx:194`) |
| `…/EvalsTab/EvalsTab.test.tsx`, `…/EvalCaseModal/EvalCaseModal.test.tsx` | Mod (fixture factories gain `origin: "finding"`) | test | RTL | client tsconfig includes tests (`client/tsconfig.json:33`) |

### L2: server

| File | New/Mod | Ring / home | Skills | Constraint to respect |
|---|---|---|---|---|
| `server/src/modules/eval/constants.ts` | Mod | ring 1 | OA | reason-code constants typed from the W1 enums |
| `server/src/modules/eval/helpers/case-diff.ts` | Mod | ring 1 | OA | must not import `src/adapters` (`core-not-to-io`); pure |
| `server/src/modules/eval/helpers/prompt.ts` | Mod | ring 1 | OA, sec | the task slot is TRUSTED and unwrapped (`server/INSIGHTS.md:74`, entry "task slot") |
| `server/src/modules/eval/run-executor.ts` | Mod (only if a prompt-helper signature change needs it) | ring 3 | OA | snapshot semantics unchanged (`service.ts:303-312`) |
| `server/src/modules/eval/repository.ts` | Mod | ring 3 | OA, drizzle | every case read/write scoped by `workspace_id` |
| `server/src/modules/eval/service.ts` | Mod | ring 3 | OA, sec | constructor deps unchanged; no `Container`; no adapter import |
| `server/src/modules/eval/routes.ts` | Mod | ring 4 | fastify, OA, sec | no drizzle import (Ban 1); body schema `EvalCaseCreate` (strict) |
| `server/test/eval-paste-diff.test.ts` | New | test | — | unit; reads the parity JSON |
| `server/test/eval-manual-run.test.ts` | New | test | — | unit; stub/spy LLM; NOT `eval-scoring.test.ts` |
| `server/test/eval-manual-cases.it.test.ts` | New | test | — | `.it.test.ts` suffix (root `CLAUDE.md`); drain runs before the next `buildApp()` (`server/INSIGHTS.md`, eval boot-reaper entry) |

### L3: client

| File | New/Mod | Home | Skills | Constraint to respect |
|---|---|---|---|---|
| `client/src/lib/eval-case-diff.ts` (+ `eval-case-diff.test.ts`) | New | domain module | FUA | named for the concept, no `utils`; pure |
| `client/src/lib/eval.ts` (+ `eval.test.ts`) | Mod | domain module | FUA | already value-imports `EvalExpectation` (`lib/eval.ts:10`); receives `METRICS`/`TREND_Y_*` (W11) |
| `client/src/lib/hooks/eval.ts` | Mod | data hooks | FUA, react | `meta: { quietError: true }` on create/update (`client/INSIGHTS.md:23`); one toast via `notify.error` |
| `client/messages/en/eval.json` | Mod | i18n | FUA | a missing key renders raw; every key added in W8 |
| `…/EvalsTab/_components/EvalCaseModal/{EvalCaseModal.tsx, helpers.ts, styles.ts, EvalCaseModal.test.tsx}` | Mod | route-local | FUA, react, RTL | `getByDisplayValue` cannot match multi-line textareas (`client/INSIGHTS.md:55`) |
| `…/EvalCaseModal/_components/DiffInput/` (`DiffInput.tsx`, `styles.ts`, `index.ts`) | New | route-local child | FUA, react | preview via `@/components/diff-viewer` `DiffViewer` without `commenting` |
| `…/EvalCaseModal/_components/PrMetaInput/` (`PrMetaInput.tsx`, `styles.ts`, `index.ts`) | New | route-local child | FUA, react | — |
| `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx, helpers.ts, styles.ts}` | Mod | route-local | FUA, react, RTL | button + modal share the label "New eval case": scope queries with `within(getByRole("dialog"))` |
| `…/EvalsTab/_components/EvalCaseRow/{EvalCaseRow.tsx, styles.ts}` | Mod | route-local | FUA, react | — |
| `…/EvalsTab/_components/MetricTrend/` (`MetricTrend.tsx`, `styles.ts`, `index.ts`, `MetricTrend.test.tsx`) | New | route-local (one consumer) | FUA, react, RTL | — |
| `client/src/vendor/ui/charts/LineChart.tsx` (+ `LineChart.test.tsx`) | Mod | design system | FUA, react | y ticks stay explicit for 0–1 consumers (`client/INSIGHTS.md:50`); default behaviour unchanged (AC-58) |
| `client/src/components/EvalTrendChart/` (`EvalTrendChart.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, `EvalTrendChart.test.tsx`) | New | shared (2 routes on day one) | FUA, react, RTL | second consumer exists → `src/components` |
| `client/src/app/eval/[agentId]/_components/EvalAgentDetail/{constants.ts, helpers.ts}`, `_components/TrendChart/TrendChart.tsx` (+ new `TrendChart.test.tsx`) | Mod | route-local | FUA, react, RTL | `EvalAgentDetail.test.tsx` must pass byte-unchanged (AC-60) |

**Coverage gaps:** `server/test/fixtures/*.json` and this plan file are unrouted by design. The generated
`0021_*.sql` is not hand-reviewed. `typescript-expert` governs no file here.

---

## Contract changes

- **vendor/shared: yes.** One file, `contracts/eval-ci.ts`, changes in both copies, byte-identical, all in W1.
  Every addition is placed **after** the schema it references, inside the existing SPEC-04 "Eval" section:
  - `EVAL_CASE_MAX_BYTES = 200 * 1024` (exported value) and a private `NoNul` string schema
    (`z.string().refine(s => !s.includes("\u0000"), …)`). Put both just above `EvalExpectationKind`.
  - `EvalCaseOrigin = z.enum(['finding','manual'])`.
  - `EvalCaseInputMeta.pr_number` → `z.number().int().nullable()`.
  - `EvalCase` gains `origin: EvalCaseOrigin`. `labels` → `EvalCaseLabels.nullable()`, and `source` →
    `EvalCaseSource.nullable()`.
  - `EvalCaseUpdate` (still `.strict()`):
    - `name` gains `.max(60)`; `name` and `notes` move to `NoNul`;
    - new `input_diff: NoNul.optional()`;
    - new `input_meta: z.object({ title: NoNul, body: NoNul.nullable() }).strict().optional()`, with a
      `.refine` that title + body ≤ `EVAL_CASE_MAX_BYTES` UTF-8 bytes (`new TextEncoder()`; it works in Node
      and browsers).
  - New `EvalCaseCreate = z.object({ name: NoNul.trim().min(1).max(60), notes: NoNul.nullable().optional(), input_diff: NoNul, input_meta: z.object({ title: NoNul.optional(), body: NoNul.nullable().optional() }).strict().refine(<≤ 200 KB together>).optional(), expectation: EvalExpectation }).strict()`.
    **`input_diff` has no size cap in Zod.** An oversize diff must answer `diff_too_large`, not
    `validation_error` (AC-25).
  - New `EvalCaseInputErrorCode = z.enum(['diff_too_large','diff_unparseable','multi_file_diff','diff_frozen'])`,
    placed beside the existing reason-code enums. `EvalUpdateCaseErrorCode` is **left as is**, so the client's
    `Record<EvalUpdateCaseErrorCode, …>` (`client/src/lib/eval.ts:164`) keeps compiling.
  - `EvalTrendPoint` gains **optional** `run_id: z.string()`, `agent_version: z.number().int()` and
    `cost_usd: z.number().nullable()` (Spec follow-up 4).
- **Migration: yes, one.** It is `0021_<generated>.sql`, produced by `pnpm db:generate`.
  - `eval_cases.origin text NOT NULL DEFAULT 'finding'`, enum `finding|manual`. Every existing row becomes
    `finding` (AC-42).
  - `source_pr_number`, `source_repo` and `labels` drop NOT NULL.
  - Optionally a CHECK constraint (W2). The migration adds and relaxes columns and drops none, so the
    `strict: true` rename prompt (`server/INSIGHTS.md`, two-pass entry) cannot trigger.
- **Seed: no** (DR-24). Existing seed inserts omit `origin` and get the default. AC-42 checks this.
- **Client build check needed: yes.**
  - No **new** value import from `@devdigest/shared` is planned. `lib/eval.ts` already value-imports, and any
    new one (e.g. `EVAL_CASE_MAX_BYTES`) rides the same path.
  - But the runtime-imported barrel gains new schemas whose order matters, and `vendor/ui` LineChart changes.
  - So Integration runs `pnpm build` in `client/` (`client/INSIGHTS.md:22`), with the dev-server protocol:
    stop `pnpm dev` → build → `rm -rf client/.next` → restart → never trust the first render
    (`client/INSIGHTS.md:26,45`).
- **i18n: yes.** Only `client/messages/en/eval.json` changes, all in W8. The keys are listed in W8.

---

## Work items

Server **Verify** lines run `arch:check` too (that is what `verify.mjs` does by default). The arch:check count
must not grow. Run each item's Verify once, after its last edit, as one chained call.

### Lane L1: contracts + DB (runs alone)

#### W1: Contracts for manual cases and the trend tooltip, in both vendor copies
- **Serves:** enables AC-19…AC-39 (create/update bodies), AC-20, AC-21 (nullable shapes), AC-28 (strict,
  60-char, NUL, meta size), AC-59 (trend point fields), NFR-6 (no Zod cap on the diff).
- **Do:** apply "Contract changes → vendor/shared" to `server/src/vendor/shared/contracts/eval-ci.ts`, then copy
  the file byte-for-byte to `client/src/vendor/shared/contracts/eval-ci.ts`. Add
  `server/test/eval-manual-contracts.test.ts`, which covers:
  - `EvalCaseCreate` accepts a minimal valid body (no `input_meta`, no `notes`);
  - it rejects each of: an unknown key; `name: "   "`; a 61-char name; a NUL in `name`, `notes`, `input_diff`,
    `input_meta.title`, `input_meta.body`; title + body of 200 KB + 1 byte;
  - it **accepts** a 300 KB `input_diff` (so the service can answer `diff_too_large`);
  - `EvalCaseUpdate` accepts `{input_diff}` and `{input_meta:{title, body:null}}`, and rejects
    `input_meta:{title}` without `body` and a 61-char name;
  - `EvalCase` parses a manual case (`origin:"manual"`, `source:null`, `labels:null`,
    `input_meta.pr_number:null`) and a finding case;
  - `EvalTrendPoint` parses with and without the three new fields.
- **Files:** both `contracts/eval-ci.ts` copies, `server/test/eval-manual-contracts.test.ts`.
- **Done means:**
  - Both vendor-sync tests pass.
  - The new test is green.
  - `import('@devdigest/shared')` under vitest throws no `ReferenceError` (TDZ / section order).
  - `server/test/eval-scoring.test.ts` still passes. If it fails because of this change, **stop and report**;
    do not edit it.
- **Verify:**
  - `node scripts/verify.mjs server test/eval-manual-contracts.test.ts test/vendor-shared-sync.test.ts test/eval-contracts.test.ts test/eval-scoring.test.ts`
  - `node scripts/verify.mjs client src/test/vendor-shared-sync.test.ts`

  Typecheck may stay red until W3; W3's Verify is the lane's green gate.
- **Rules that apply:**
  - zod: `object-strict-vs-strip` (`.strict()` on both bodies and on nested `input_meta`); `refine-add-path`
    (the size refine reports path `input_meta`); `type-use-z-infer` (schema and type share one name);
    `object-optional-vs-nullable` (`body` is nullable, the create `input_meta` is optional).
  - OA §2: the contract stays technology-neutral.
- **Risk:** medium. Nullable `source`/`labels` ripples to every consumer, and W3 absorbs that.

#### W2: `eval_cases.origin` + nullable source columns (one generated migration)
- **Serves:** AC-20, AC-42; enables AC-19, AC-21.
- **Do:**
  - In `server/src/db/schema/eval.ts`:
    - add `origin: text('origin', { enum: ['finding','manual'] }).notNull().default('finding')`;
    - drop `.notNull()` from `sourcePrNumber`, `sourceRepo` and `labels`;
    - update the table comment: manual cases have no source, and `origin` says which kind a row is.
  - If the installed drizzle exposes `check` from `drizzle-orm/pg-core`, add
    `check('eval_cases_origin_source_ck', sql\`(origin = 'manual') = (source_pr_number IS NULL)\`)`.
    Check `node_modules/drizzle-orm/pg-core/checks.d.ts` before relying on it. If it is absent, skip the CHECK
    and say so in the report; the service then enforces the rule alone.
  - Run `pnpm db:generate`, then `pnpm db:migrate`. `EvalCaseRow` in `server/src/db/rows.ts` is
    `$inferSelect` (`rows.ts:22`), so it follows automatically.
- **Files:** `server/src/db/schema/eval.ts`, `server/src/db/migrations/0021_*.sql`,
  `server/src/db/migrations/meta/*`.
- **Done means:**
  - Exactly one new migration exists, named `0021_<generated>.sql`. `db:generate` did not prompt.
  - The SQL contains `ADD COLUMN "origin" text DEFAULT 'finding' NOT NULL` and three `DROP NOT NULL`.
  - `pnpm db:migrate` succeeds on the dev DB.
  - `select distinct origin from eval_cases` returns only `finding` (or no rows).
- **Verify:** in `server/`, run `pnpm db:generate && pnpm db:migrate`. Then, from the repo root:
  `node scripts/verify.mjs server`. Expect typecheck errors only in files W3 fixes; W3 re-runs it.
- **Rules that apply:**
  - pg: NOT NULL + DEFAULT for a column that every row must carry; a constraint over an application-only rule
    where cheap.
  - drizzle: generate + migrate, never `push`.
- **Risk:** medium. The migration is reversible only by a new migration (see Rollback). **Isolation: runs
  alone**, because the generator rewrites `migrations/meta`.

#### W3: Make every consumer compile against the new shapes + the parity fixture
- **Serves:** AC-20, AC-42 (DTO emits `origin`, nulls for manual); AC-59 (dashboard trend fields); AC-12 (shared
  fixture list); enables L2 and L3.
- **Do:**
  - **`server/src/modules/eval/helpers/dto.ts` `caseRowToDto`:**
    - emit `origin: row.origin`;
    - when `row.origin === 'manual'`, emit `source: null`, `labels: null` and
      `input_meta: { pr_number: null, title: meta.title ?? '', body: meta.body ?? null }`, parsed defensively;
    - when it is `'finding'`, keep today's mapping. The fallback branches must cope with the now-nullable
      `sourcePrNumber`/`sourceRepo` (fallback `pr_number: row.sourcePrNumber ?? null`).
  - **`server/src/modules/eval/service.ts` `dashboard()`:** the `trend` mapping (`service.ts:449-454`) adds
    `run_id: r.id`, `agent_version: r.agent_version` and `cost_usd: r.cost_usd`. Nothing else in `service.ts`
    changes in this item.
  - **Server tests:**
    - Grep `server/test` for `labels: {`, `source: {`, `input_meta`, `EvalCase`, `trend` and any `EvalCase.parse`
      / `toEqual` on a full case DTO.
    - Add `origin: 'finding'` (or the new fields) where a parse or a deep-equal would now fail. Candidates:
      `eval-contracts.test.ts`, `eval-executor.test.ts`, `eval-cases.it.test.ts`, `eval-runs.it.test.ts`,
      `eval-compare.it.test.ts`.
    - Server typecheck excludes `server/test`, so the grep is the only check before the run.
    - Never touch `eval-scoring.test.ts`.
  - **Client, null-safety only (no new behaviour):**
    - `EvalCaseRow.tsx`: reads `evalCase.labels?.severity` / `?.category`.
    - `EvalCaseModal.tsx`: the source line uses `evalCase.source?.available`, and the PR-meta number tolerates
      null. A manual case cannot exist yet, so a minimal guard is enough; W9 rewrites these.
    - The fixture factories in `EvalsTab.test.tsx` and `EvalCaseModal.test.tsx` gain `origin: "finding"`.
  - **Parity fixture:** create `server/test/fixtures/eval-case-diff-parity.json`, an array of
    `{ name, diff, expectation?, expect: { diff: null | "diff_too_large" | "diff_unparseable" | "multi_file_diff", path?: string, expectation?: null | "file_mismatch" | "range_outside_hunks", skeleton?: { start_line: number } | null } }`.
    - `diff` is either a string or `{ "repeatToBytes": <n>, "header": "<text>" }`, which each test expands, so
      no 200 KB blob is stored.
    - CRLF entries are written with `\r\n` escapes inside the JSON string, so git autocrlf cannot rewrite them.
    - The entries are exactly AC-12's list (`:200-210`): a range on an added line; on a context line; on a
      removed-only line; between two hunks; one past the last hunk with `\ No newline at end of file`; hunk
      counts shorter than the body; CRLF; `+++ /dev/null`; two `+++` without `diff --git`; exactly 200 KB;
      200 KB + 1.
    - Add a deletion-only entry (skeleton null, AC-10) and a context-only entry (skeleton = first context line,
      AC-9).
- **Files:** `server/src/modules/eval/helpers/dto.ts`, `server/src/modules/eval/service.ts` (trend mapping
  only), the server test files the grep finds (not `eval-scoring.test.ts`), the client `EvalCaseRow.tsx`,
  `EvalCaseModal.tsx`, `EvalsTab.test.tsx` and `EvalCaseModal.test.tsx`, and
  `server/test/fixtures/eval-case-diff-parity.json`.
- **Done means:**
  - `node scripts/verify.mjs server` is green: typecheck, unit and arch at baseline.
  - `node scripts/verify.mjs client` is green.
  - `cd server && pnpm exec vitest run test/eval-cases.it.test.ts test/eval-runs.it.test.ts test/eval-compare.it.test.ts`
    is green with **0 skipped**.
  - The fixture file parses as JSON and has ≥ 13 entries.
- **Verify:**
  - `node scripts/verify.mjs server`
  - `node scripts/verify.mjs client`
  - from `server/`: the three `.it` files above (Docker running).
- **Rules that apply:** OA Ban 3 (the DTO is the only shape that leaves the module); FUA (fixtures stay typed
  from `@devdigest/shared`).
- **Risk:** low.

### Lane L2: server (after L1; parallel with L3)

#### W4: Ring-1 paste rules and the manual prompt slots
- **Serves:** AC-22, AC-23, AC-25 (rule + order), AC-12 (server side), AC-45, AC-46, AC-47 (helpers); enables
  AC-35, AC-37.
- **Do:**
  - In `helpers/case-diff.ts`, add `checkPastedDiff(raw: string)`, which returns
    `{ ok: true, path: string, diff: string } | { ok: false, code: 'diff_too_large' | 'diff_unparseable' | 'multi_file_diff' }`.
    The checks run in this order, and the first failure wins:
    1. `caseDiffTooLarge(raw)`, measured on the text **as sent** (Assumption A2);
    2. normalise `\r\n` → `\n` (AC-23);
    3. find the first `+++ ` line. Its path is `line.slice(4).trim()` with a leading `b/` removed. Missing, or
       `/dev/null`, means `diff_unparseable`;
    4. no line matching `^@@ -\d+(,\d+)? \+\d+(,\d+)? @@` means `diff_unparseable`;
    5. `max(count('diff --git'), count('+++ ')) > 1` means `multi_file_diff` (Assumption A3).

    On success, `diff = buildCaseDiff(path, <text from the first @@ line to the end>)`. That drops the pasted
    `diff --git`/`index`/`---`/`+++` header lines, so a `+++`-only paste and a full-header paste store
    identical diffs (AC-22).
  - In `constants.ts`:
    - add `CASE_INPUT_ERROR` constants typed from `EvalCaseInputErrorCode`;
    - alias `MAX_CASE_DIFF_BYTES` to `EVAL_CASE_MAX_BYTES` from `@devdigest/shared`, so one number governs both
      packages;
    - keep `CASE_NAME_MAX = 60`.
  - In `helpers/prompt.ts`:
    - `evalTaskLine(meta: { pr_number: number | null })`: when `pr_number === null`, return the same wording
      with "Review pull request #N" replaced by fixed words ("Review this change"). It contains no digit from
      user input and no user text (AC-45).
    - `evalPrDescription(meta)` returns `string | undefined`: `undefined` when `!meta.title && !meta.body`
      (AC-47), else `Title: <title>` + `\n\n<body>` when there is a body (AC-46, unchanged for finding-born
      cases).
    - Update the doc comments; the line "Always non-empty" is no longer true.
    - Touch `run-executor.ts` only if the `string | undefined` return needs it. The engine's `prDescription` is
      already optional (`reviewer-core/src/prompt.ts:109,152-166`).
  - New `server/test/eval-paste-diff.test.ts`:
    - It loads `test/fixtures/eval-case-diff-parity.json` (`join(process.cwd(), 'test/fixtures/…')`).
    - For each entry it runs `checkPastedDiff`, then for valid ones `parseUnifiedDiff` (from `src/adapters/git`;
      tests may import adapters) + `diffFilePath` + `rangeIntersectsHunks`.
    - It asserts `expect.diff` / `expect.path` / `expect.expectation` (AC-12, server half).
    - AC-22: the `+++`-only paste and the full-header paste give an identical `diff`; parsing yields one file
      with the pasted path and the pasted new-side numbers.
    - AC-23: the CRLF and LF forms give an identical `diff`.
    - AC-25 order: a 300 KB two-file diff → `diff_too_large`; a `/dev/null` + second file → `diff_unparseable`.
    - Prompt helpers: a `null` pr_number gives a task line with no `#\d`; `evalPrDescription({title:'',body:null})`
      gives `undefined`.
- **Files:** `server/src/modules/eval/helpers/case-diff.ts`, `server/src/modules/eval/helpers/prompt.ts`,
  `server/src/modules/eval/constants.ts`, `server/src/modules/eval/run-executor.ts` (only if needed),
  `server/test/eval-paste-diff.test.ts`.
- **Done means:**
  - The test is green.
  - `case-diff.ts` and `prompt.ts` still import nothing from `src/adapters`, `db/` or `platform/container`
    (grep).
  - The existing `test/eval-case-diff.test.ts` and `test/eval-executor.test.ts` are still green: the finding-born
    task line and description are byte-unchanged.
- **Verify:** `node scripts/verify.mjs server test/eval-paste-diff.test.ts test/eval-case-diff.test.ts test/eval-executor.test.ts`
- **Rules that apply:** OA §1 (ring 1 is the test-speed ring); sec: untrusted text never reaches the trusted
  task slot (`server/INSIGHTS.md`, task-slot entry).
- **Risk:** low.

#### W5: Create endpoint + manual-case update in repository, service and route
- **Serves:** AC-19…AC-21, AC-24…AC-29, AC-35…AC-39, NFR-6; part of AC-30.
- **Do:**
  - **`repository.ts`:**
    - `insertCase` accepts the nullable source columns and `origin`. The types follow the schema.
    - `updateCase` additionally accepts `inputDiff` and `inputMeta`.
    - Both stay workspace-scoped. Keep `caseNamesForAgent(workspaceId, agentId)` as is.
  - **`service.ts`, new `createManualCase(workspaceId, agentId, body: EvalCaseCreate): Promise<EvalCase>`.**
    No model call and no `resolveLlm`. The steps run in order:
    1. `agents.getById(workspaceId, agentId)`; absent → `NotFoundError` (AC-29).
    2. `checkPastedDiff(body.input_diff)`; failure → `AppError(code, msg, 422)` (AC-25).
    3. `parseDiff(diff)`: `expectation.file !== path` → 422 `file_mismatch` (AC-26); `!rangeIntersectsHunks` →
       422 `range_outside_hunks` (AC-27).
    4. `name = uniqueCaseName(body.name /* already trimmed by Zod */, new Set(await repo.caseNamesForAgent(...)))`
       (AC-24).
    5. Insert with:
       - `origin: 'manual'`, and `sourceFindingId`, `sourcePrNumber`, `sourceRepo`, `labels` all `null`;
       - `inputMeta: { pr_number: null, title: body.input_meta?.title ?? '', body: body.input_meta?.body || null }`
         (AC-21);
       - `expectedOutput: body.expectation`, `notes: body.notes ?? null`.
    6. Return `caseRowToDto(row, null)`.
  - **`service.ts`, extend `updateCase`.** The order, with nothing written before the last step:
    1. 404 as today.
    2. If `body.input_diff !== undefined || body.input_meta !== undefined` and `row.origin === 'finding'` → 422
       `diff_frozen` (AC-36).
    3. If `input_diff` is sent → `checkPastedDiff` → 422 code (AC-37).
    4. `resultingDiff = newDiff ?? row.inputDiff` and `resultingExp = body.expectation ?? stored expectation`.
       When the diff or the expectation changes, run the `file_mismatch` / `range_outside_hunks` checks on the
       resulting pair (AC-38). For a finding-born case with only an expectation sent, today's behaviour holds.
    5. A single `repo.updateCase` with `inputDiff`/`inputMeta` (`{pr_number:null, title, body: body || null}`)
       when sent (AC-35).

    Messages are human sentences; the client maps on `code`.
  - **`routes.ts`:**
    - `app.post('/agents/:id/eval/cases', { schema: { params: IdParams, body: EvalCaseCreate } }, …)` →
      `reply.code(201).send(...)`.
    - Update the header comment's endpoint list. The PATCH route keeps `body: EvalCaseUpdate`, which now
      carries the new fields.
    - The body limit is the app's 1 MB (`server/src/app.ts:50`). Do not add a per-route `bodyLimit` or rate
      limit (DR-26).
- **Files:** `server/src/modules/eval/repository.ts`, `server/src/modules/eval/service.ts`,
  `server/src/modules/eval/routes.ts`.
- **Done means:**
  - Typecheck is green; arch:check is at baseline.
  - `service.ts` imports neither `adapters/` nor `platform/container`; `routes.ts` imports neither `drizzle-orm`
    nor `db/schema`.
  - `createManualCase` never references `resolveLlm` (grep).
  - A Zod body failure on the new route answers 422 with `code: 'validation_error'`. That is the app-level
    handler (`server/src/app.ts:133,158`); confirm with the W6 test, not by assumption.
- **Verify:** `node scripts/verify.mjs server src/modules/eval/service.ts src/modules/eval/routes.ts src/modules/eval/repository.ts`
- **Rules that apply:**
  - fastify: schema-first body, `reply.code(201)`.
  - sec: A01 (every id resolved through the workspace), A08 (strict body, no mass assignment), input size
    limits.
  - OA §4: deps unchanged, no `Container`.
- **Risk:** medium (tenancy + the frozen-input rule).

#### W6: Integration test for manual cases
- **Serves:** AC-19…AC-21, AC-24…AC-29, AC-35…AC-39, AC-42, AC-43, AC-48, NFR-6.
- **Do:** new `server/test/eval-manual-cases.it.test.ts`. Mirror the setup of `server/test/eval-cases.it.test.ts`
  (app, workspace, agent, second workspace per `server/test/agents-versions.it.test.ts:174`). It goes through
  HTTP (`app.inject`), so route validation is exercised.
  - **AC-19/20/21:**
    - a 201 body and a later GET list show `origin:"manual"`, `source:null`, `labels:null`;
    - with no `input_meta`: `{pr_number:null,title:"",body:null}`;
    - with both fields, they read back as sent.
  - **AC-24:** "sql-injection" twice → `sql-injection`, `sql-injection-2`; a taken 60-char name → a 60-char name
    ending `-2`.
  - **AC-25:**
    - each failing diff → its code, and the row count is unchanged;
    - a 300 KB two-file diff → `diff_too_large`;
    - two `+++` without `diff --git` → `multi_file_diff`.
  - **AC-26/27:** wrong file → `file_mismatch`; between hunks and removed-only → `range_outside_hunks`; a context
    line → 201.
  - **AC-28:** each of unknown key / blank name / 61-char name / meta > 200 KB / NUL → 422 `validation_error`,
    on both POST and PATCH, with no row created or changed.
  - **AC-29:** another workspace's agent id and a random uuid → 404; neither workspace gains a row.
  - **AC-35:** PATCH a manual case's diff (CRLF) + meta → GET shows the normalised diff and the new meta.
  - **AC-36:** PATCH `{name, expectation, input_diff}` on a finding-born case → 422 `diff_frozen`, and the stored
    name and expectation are unchanged.
  - **AC-37:** each failing diff on PATCH → its code; the case is unchanged.
  - **AC-38:**
    - replace the diff with one for another path and send no expectation → `file_mismatch`;
    - move the hunks away from the stored range → `range_outside_hunks`.
  - **AC-39:** a second workspace's PATCH with `input_diff` → 404, and the owner's GET is unchanged.
  - **AC-42:**
    - insert a finding-born case the SPEC-04 way and confirm `origin:"finding"` with non-null `source`/`labels`;
    - run the seed the way `server/test/eval-seed.it.test.ts` does, then every seeded case has
      `origin:"finding"` and non-null `source`/`labels`.
  - **AC-43:** 2 finding-born + 1 manual → 3 in the list, in a run's `cases_total`, in `/eval/overview` and in
    `/agents/:id/eval/dashboard`.
  - **AC-48:**
    - start a run with a gated stub LLM (pattern: `eval-runs.it.test.ts`), create a manual case mid-run, release
      the gate, await `done`;
    - the run's `cases_total` is unchanged, and the new case has no outcome in it;
    - drain every run before the next test builds an app (`server/INSIGHTS.md`, boot-reaper entry).
  - **NFR-6:** a 200 KB ordinary-text diff + title/body of 200 KB together → 201.
  - Use only `sk_live_xxx`-style placeholders in fixtures (SPEC-04 NFR-1 guard).
- **Files:** `server/test/eval-manual-cases.it.test.ts`.
- **Done means:** `cd server && pnpm exec vitest run test/eval-manual-cases.it.test.ts` is green with **0
  skipped**. Read the skipped count; a skipped DB suite is not a pass.
- **Verify:** from `server/` with Docker running: `pnpm exec vitest run test/eval-manual-cases.it.test.ts`.
- **Rules that apply:** testing: a DB-backed file uses the `.it.test.ts` suffix; sec: cross-workspace 404s.
- **Risk:** low.

#### W7: Run-path unit tests for manual cases
- **Serves:** AC-30, AC-40, AC-44, AC-45, AC-46, AC-47, NFR-4.
- **Do:** new `server/test/eval-manual-run.test.ts`. Mirror the stub/spy LLM and executor setup of
  `server/test/eval-executor.test.ts`; do not import from or edit `eval-scoring.test.ts`.
  - **AC-30:** an `EvalService` with a fake repository and a `resolveLlm` whose provider throws on any call.
    `createManualCase` and a manual `updateCase` both succeed, and the provider's call count is 0.
  - **AC-40:**
    - start a run over a manual case with a gated stub, then call `updateCase` with a new diff, then release;
    - the prompt captured for that case holds the **old** diff.
    - If a fake repository for `startRun` is heavier than the test, move this one case into W6's it file and say
      so in the report.
  - **AC-44:** a stub returning a grounded finding on the manual case's range → the case passes as `must_find`
    and fails as `must_not_flag`, and it enters recall and precision (via the run's metrics).
  - **AC-45:**
    - put a sentinel string in the manual case's title, body, name and notes;
    - the captured `task` contains no `#\d` and none of the sentinels.
  - **AC-46:** the title and body appear only inside the engine's untrusted PR-description delimiter.
  - **AC-47:** a manual case with empty title and null body → the captured prompt has no PR-description section.
  - **NFR-4:**
    - the manual diff sits inside `<untrusted source="diff">`;
    - an injected `</untrusted>` in the diff and in the body comes out escaped.
- **Files:** `server/test/eval-manual-run.test.ts`.
- **Done means:** the test is green; no production file changes in this item.
- **Verify:** `node scripts/verify.mjs server test/eval-manual-run.test.ts`
- **Rules that apply:** sec: untrusted delimiters (SPEC-04 NFR-5 unchanged); OA §1.
- **Risk:** low.

### Lane L3: client (after L1; parallel with L2). Phase L3a, then phase L3b.

The client tests mock `fetch`/hooks and never need the L2 server.

#### W8 (L3a): Client case-diff rules, error mapping, create hook, all i18n keys
- **Serves:** AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12 (client half), AC-14, AC-16, AC-17, AC-34 (patch
  builder), AC-54 (formatting), NFR-1; enables W9–W12.
- **Do:**
  - **New `client/src/lib/eval-case-diff.ts`** (pure; `import type` from `@devdigest/shared`, plus at most the
    `EVAL_CASE_MAX_BYTES` value):
    - **`checkPastedDiff(raw)`:** the same order and rules as the server's W4, with the byte size from
      `new TextEncoder().encode(raw).length`. It returns `{ok:true, path, hunks}` or `{ok:false, code}`.
      Empty text → `{ok:false, code:null}`, meaning "show nothing" (AC-7).
    - **`caseNewSideLines(hunks)`:** a port of `parseUnifiedDiff`'s hunk numbering
      (`server/src/adapters/git/diff-parser.ts:45-76`) **plus** the clamp to the header range of
      `rangeIntersectsHunks` (`server/src/modules/eval/helpers/case-diff.ts:41-62`). It returns per hunk the
      numbers, the first added line and the first context line.
    - **`expectationDiffError(check, exp)`:** `'file_mismatch' | 'range_outside_hunks' | null` (AC-11).
    - **`findingSkeleton(check)`:** `{kind:'must_find', file, start_line:L, end_line:L}` or `null` (AC-9, AC-10).
      L is the first added new-side line, else the first context line; null when there is none.
    - **`previewFile(check)`:** a `PrFile` `{path, additions, deletions, patch}` whose patch is the hunks with
      the pasted header lines and the `\ No newline` marker lines removed (AC-5, AC-6; Assumption A5).
  - **`client/src/lib/eval-case-diff.test.ts`:**
    - it loads `join(process.cwd(), '../server/test/fixtures/eval-case-diff-parity.json')`, the same
      cwd-anchored path pattern as `client/src/test/vendor-shared-sync.test.ts`, and asserts every `expect.*`
      (AC-12, client half);
    - the AC-6 count of added lines equals the hunks' `+` lines;
    - the AC-7 order (a paste failing checks 1 and 3 → only `diff_too_large`);
    - AC-9 (first added line 12 → 12/12; context-only → first context line);
    - TextEncoder is available in the vitest jsdom environment. If it is not, import it from `node:util` in
      the test setup and say so.
  - **`client/src/lib/eval.ts`:**
    - add `CASE_INPUT_ERROR_KEY: Record<EvalCaseInputErrorCode | 'validation_error', string>` →
      `errors.<code>`;
    - add `caseSaveErrorKey(err)`: input codes, then `UPDATE_CASE_ERROR_KEY` codes, else `errors.generic`
      (a 404 included);
    - add `trendTooltipParts(point)` → `{ when: formatWhen(started_at), version: agent_version ?? null, cost: formatCost(cost_usd ?? null), recall/precision/citation: formatMetric(...) }`.
      `formatWhen` is the run history's formatter (`RunHistory.tsx:13`).
    - Extend the key-completeness test in `eval.test.ts` to the new map.
  - **`client/src/lib/hooks/eval.ts`:**
    - new `useCreateManualEvalCase(agentId)`: `meta: { quietError: true }`;
      `mutationFn: (body: EvalCaseCreate) => api.post<EvalCase>(\`/agents/${agentId}/eval/cases\`, body)`;
      `onSuccess` invalidates `evalKeys.cases(agentId)`, `evalKeys.dashboard(agentId)` and
      `evalKeys.overview`; `onError` → `notify.error(t(caseSaveErrorKey(err)))`, exactly one toast;
    - switch `useUpdateEvalCase`'s `onError` to `caseSaveErrorKey`.
  - **`client/messages/en/eval.json`:** add every key for W9–W12 now, so the later items only read them:
    - `evalsTab.newCase` ("New eval case");
    - `evalsTab.emptyBody`, rewritten to name both sources: "Turn into eval case" on an accepted or dismissed
      finding, and "New eval case" (AC-49);
    - `evalsTab.row.manual` ("manual");
    - `caseModal.createTitle` ("New eval case"), `caseModal.createSubtitle`
      ("{agent} · simulate a PR and assert the expected output");
    - `caseModal.diffPlaceholder`, naming `+++ b/<path>` and an `@@` hunk;
    - `caseModal.diffErrors.{diff_too_large,diff_unparseable,multi_file_diff}`;
    - `caseModal.expectationErrors.{file_mismatch,range_outside_hunks}`;
    - `caseModal.skeleton` ("Finding skeleton"), `caseModal.prMeta.titleLabel`, `caseModal.prMeta.bodyLabel`;
    - `caseModal.source.manual` ("Created manually");
    - `errors.{diff_too_large,diff_unparseable,multi_file_diff,diff_frozen,validation_error}`;
    - `trend.title` ("Metric trend"), `trend.notEnough` ("Run the suite at least twice to see a trend"),
      `trend.loadError`, `trend.chartLabel`;
    - `trend.tooltip.{version,cost,recall,precision,citation}`, where `version` = "v{version}".

    Existing keys are kept.
- **Files:** `client/src/lib/eval-case-diff.ts`, `client/src/lib/eval-case-diff.test.ts`,
  `client/src/lib/eval.ts`, `client/src/lib/eval.test.ts`, `client/src/lib/hooks/eval.ts`,
  `client/messages/en/eval.json`.
- **Done means:**
  - Both test files are green, including every parity fixture.
  - The completeness test resolves every new error key.
  - `eval-case-diff.ts` has no React import.
- **Verify:** `node scripts/verify.mjs client src/lib/eval-case-diff.test.ts src/lib/eval.test.ts`
- **Rules that apply:**
  - FUA §5 ladder: pure rules in `lib/`, data in `lib/hooks`.
  - FUA §7: i18n keys are added with the strings.
  - react: no derived state.
  - `client/INSIGHTS.md:23` (`quietError`; the 422 is an answer, shown as one toast).
- **Risk:** medium. Parity with the server parser is subtle; the shared fixture is the guard.

#### W9 (L3a): EvalCaseModal create mode and manual-case edit mode
- **Serves:** AC-3…AC-11, AC-13, AC-14, AC-15, AC-17, AC-18, AC-31…AC-34, NFR-2, NFR-3, NFR-5, NFR-7.
- **Do:**
  - **Props become a union:** `{ mode: "create"; agentId; agentName; onClose }` |
    `{ mode: "edit"; evalCase; agentName; onClose }`.
  - **Create mode:**
    - title `caseModal.createTitle`, subtitle `caseModal.createSubtitle`; width stays 920;
    - empty Name/Notes, Diff tab selected, an empty Expected pane with its valid/invalid badge;
    - a ghost "Finding skeleton" button with `icon="Plus"`; Cancel/Save;
    - no Last-run line and no source line (AC-3).
  - **Edit mode, `origin: "manual"`:** the create-mode inputs, prefilled from the case (AC-31), plus source line
    `caseModal.source.manual` (AC-33).
  - **Edit mode, `origin: "finding"`:** today's read-only Diff/PR meta and PR source line; no skeleton (AC-32).
  - **New child `_components/DiffInput/`:**
    - a mono `Textarea` with `caseModal.diffPlaceholder` (AC-4);
    - below it, either the first failing check's message (`caseModal.diffErrors.<code>`) or
      `<DiffViewer files={[previewFile(check)]} />`, with **no** `commenting` prop, so there is no "+" affordance
      (AC-5, AC-7);
    - pass `focus={{ path }}` (or whatever `DiffFocus` requires) so a large paste starts expanded past
      `AUTO_EXPAND_MAX_LINES` (`FileCard.tsx:72-74`). Check the `DiffFocus` shape in `diff-viewer/focus.ts`.
  - **New child `_components/PrMetaInput/`:** optional Title (`TextInput`) and Body (`Textarea`), with no PR
    number and no Linked issue (AC-8).
  - **The skeleton button** replaces the pane text with `JSON.stringify(findingSkeleton(check), null, 2)`. It is
    disabled while the skeleton is null (AC-9, AC-10).
  - **Under the pane,** when the expectation parses but `expectationDiffError` is non-null, show
    `caseModal.expectationErrors.<code>` (AC-11).
  - **Save is disabled** when any of these holds (AC-13; the 60-char rule also applies to finding-born edits):
    the trimmed name is empty or over 60; the diff is editable and empty or invalid; the expectation is invalid
    or has an AC-11 error; or a request is pending.
  - **Saving:**
    - Create: guard with a ref so a double click issues one `useCreateManualEvalCase().mutate` (AC-14); the
      label reads `caseModal.saving` while pending; `onSuccess` → `onClose` (AC-15).
    - Manual edit: extend `buildPatch` in `helpers.ts` with `input_diff` when the text changed and
      `input_meta {title, body: body || null}` when either changed; no change → close with no request (AC-34).
    - Failure: the modal stays open with every field as typed (state is untouched; AC-17).
  - **Cancel / Escape:** `onClose`, no request, no confirm (AC-18). `Modal` already closes on Escape.
  - Split the work into children so `EvalCaseModal.tsx` stays one job (FUA §3; react: ≤ ~200 lines).
  - **Every user string renders as React text,** never `dangerouslySetInnerHTML` (NFR-3).
  - **Tests in `EvalCaseModal.test.tsx`:**
    - query multi-line textareas by role + `toHaveValue`, never `getByDisplayValue` (`client/INSIGHTS.md:55`);
    - use `fireEvent` (there is no user-event);
    - an `<img src=x onerror=…>` sentinel in name, notes, diff, title and body creates no `img` element (NFR-3);
    - each AC's Verify line, including the AC-17 list (`diff_unparseable`, `multi_file_diff`, `diff_too_large`,
      `file_mismatch`, `range_outside_hunks`, `diff_frozen`, `validation_error`, 404 → one toast with English
      text, fields kept);
    - NFR-2: every new control is a native focusable element and `focus()` lands on it (Spec follow-up 1).
- **Files:** `…/EvalCaseModal/{EvalCaseModal.tsx, helpers.ts, styles.ts, EvalCaseModal.test.tsx}`,
  `…/EvalCaseModal/_components/DiffInput/{DiffInput.tsx, styles.ts, index.ts}`,
  `…/EvalCaseModal/_components/PrMetaInput/{PrMetaInput.tsx, styles.ts, index.ts}`.
- **Done means:**
  - `EvalCaseModal.test.tsx` is green with one test per AC listed under Serves.
  - The SPEC-04 tests in it still pass; only fixtures may change.
  - `grep -nE "#[0-9a-fA-F]{3,6}\b|rgb\(" ` over the new and changed style files finds nothing (NFR-5).
- **Verify:** `node scripts/verify.mjs client "src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/EvalCaseModal/EvalCaseModal.test.tsx"`
- **Rules that apply:**
  - FUA §2/§3 (children under `_components/`; one-component barrels only).
  - react: derive, don't store (override-over-case state pattern, `EvalCaseModal.tsx:7-11`); no component
    defined in render.
  - RTL: role queries.
  - sec: render as text.
- **Risk:** medium (the modal's size and the three modes).

#### W10 (L3a): Evals tab header button, create flow, manual row badge, EmptyState
- **Serves:** AC-1, AC-2, AC-16, AC-41, AC-49, NFR-2.
- **Do:**
  - **`EvalsTab.tsx`:**
    - after `EvalRunButton` in `headerActions`, add `<Button kind="primary" icon="Plus">{t("evalsTab.newCase")}</Button>`.
      It is never disabled (AC-1, AC-2).
    - local `const [creating, setCreating] = useState(false)`, not URL state (DR-18). When it is true, render
      `<EvalCaseModal mode="create" agentId agentName onClose={() => setCreating(false)} />`.
    - the existing `?case=` edit flow passes `mode="edit"`.
  - **EmptyState** uses the rewritten `evalsTab.emptyBody` (AC-49).
  - **`EvalCaseRow.tsx`:** when `origin === "manual"`, render the kind badge plus a "manual" `Badge` in place of
    the severity · category chip (AC-41). Finding rows are unchanged.
  - **`EvalsTab.test.tsx`:**
    - AC-1: button order and kind;
    - AC-2: enabled with zero cases, with no run, with a `running` run;
    - AC-16: with a mocked 201 and a mocked refetch of the list containing the new case, the row renders and
      "Run all evals (N+1 cases)" shows;
    - AC-41 and AC-49.
    - The button and the modal title share "New eval case", so scope queries with `within(getByRole("dialog"))`
      for the modal and `getByRole("button", { name: … })` outside it.
- **Files:** `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx, styles.ts}`,
  `…/EvalsTab/_components/EvalCaseRow/{EvalCaseRow.tsx, styles.ts}`.
- **Done means:** `EvalsTab.test.tsx` is green, including the SPEC-04 tests; no role-query collision on
  "New eval case".
- **Verify:** `node scripts/verify.mjs client "src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx"`
- **Rules that apply:** FUA §5 (modal-open state is local); react (`{count > 0 && …}`, no `&&` on numbers).
- **Risk:** low.

#### W11 (L3b): LineChart tooltip/gaps/dots + shared EvalTrendChart + dashboard tooltip
- **Serves:** AC-53 (gap support), AC-54 (tooltip rendering), AC-58, AC-59, AC-60, NFR-2 (chart keyboard),
  NFR-3 (tooltip text), NFR-5; enables AC-50…AC-52.
- **Do:**
  - **`client/src/vendor/ui/charts/LineChart.tsx`**, changes that are behaviour-neutral by default:
    - `ChartSeries.data: (number | null)[]`. `null` → the row value stays `null` and the `Line` gets
      `connectNulls={false}`, which leaves a gap. `undefined` (a shorter series) → `0`, as today
      (`LineChart.tsx:39`). No existing caller passes null, because the old type was `number[]`.
    - New optional `dots?: boolean` (default `false` = today's `dot={false}`).
    - New optional `tooltip?: { label: string; render: (index: number) => React.ReactNode }`. Only when it is
      given:
      - the wrapper `div` gets `tabIndex={0}`, `role="group"` and `aria-label={tooltip.label}`;
      - local `activeIndex` state;
      - `onKeyDown` handles ArrowLeft/ArrowRight (clamped), Home/End and Escape (clear);
      - focus selects the newest point;
      - hover sets `activeIndex` from Recharts' `onMouseMove` (`activeTooltipIndex`) and clears on
        `onMouseLeave`;
      - an absolutely positioned `div role="tooltip"` renders `tooltip.render(activeIndex)` as React children
        (text only).
    - Without `tooltip`, the rendered tree is the same as today (AC-58).
    - The y `ticks` prop stays as is; every 0–1 consumer passes explicit ticks (`client/INSIGHTS.md:50`).
  - **Hover testability:** jsdom renders `ResponsiveContainer` at 0×0, and there is no Recharts precedent in
    client tests.
    - The new tests mock `recharts`' `ResponsiveContainer` to a fixed-size wrapper.
    - If `onMouseMove` cannot be driven in jsdom, render per-point hit targets through a custom `dot` renderer
      (transparent, no visible dot when `dots` is false, so AC-60's "no dots" holds) with
      `onMouseEnter`/`onMouseLeave`, and test those.
    - Report which mechanism was used.
  - **`LineChart.test.tsx`** (new):
    - without `tooltip`, there is no `role="tooltip"` after hover and no `tabIndex` on the wrapper (AC-58);
    - a `null` value produces a `null` row value, not 0;
    - with `tooltip`, focus + ArrowRight moves the rendered tooltip to the next index (NFR-2);
    - an `<img onerror>` string from `render` stays text (NFR-3).
  - **Move** `METRICS`, `MetricKey`, `TREND_Y_MIN`, `TREND_Y_MAX` and `TREND_Y_TICKS` from
    `EvalAgentDetail/constants.ts` into `client/src/lib/eval.ts`. They now have two consumers.
    `EvalAgentDetail/constants.ts` **re-exports them under the same names**, so every existing import and
    `EvalAgentDetail.test.tsx` stay unchanged.
  - **New `client/src/components/EvalTrendChart/`:** `EvalTrendChart({ points, dots })`.
    - It renders the dashboard card's current anatomy: `Card`, `SectionLabel icon="TrendingUp"` with
      `detail.metricTrend`, the legend from `METRICS`, and `LineChart` with `yMin=0`, `yMax=1`,
      `ticks=TREND_Y_TICKS`, `w=900`, `h=200`.
    - It passes `tooltip={{ label: t("trend.chartLabel"), render: (i) => <TooltipBody parts={trendTooltipParts(points[i])} /> }}`.
      `TooltipBody` is a small child under `_components/`, not a render function.
    - `helpers.ts` holds `trendChartSeries(points)`, which keeps nulls.
    - Test: hovering/focusing a point shows the date, "v7", "$0.03", "82%", "n/a", "90%"; a null cost shows "—"
      (AC-54 rendering).
  - **Dashboard:**
    - `EvalAgentDetail/helpers.ts` gains `trendPoints(trend)`, the existing filter + `slice(-MAX_TREND_POINTS)`.
      `trendSeries` is re-expressed through it with identical output.
    - `TrendChart.tsx` renders `<EvalTrendChart points={trendPoints(trend)} dots={false} />`.
    - New `TrendChart.test.tsx` (it does not mock LineChart) checks AC-59: hovering a point shows that run's
      date, version, cost and three metrics.
    - **`EvalAgentDetail.test.tsx` is not edited** (AC-60). It mocks `LineChart` from `@devdigest/ui`
      (`EvalAgentDetail.test.tsx:25`), and that mock still intercepts because `EvalTrendChart` imports from
      `@devdigest/ui`.
- **Files:** `client/src/vendor/ui/charts/LineChart.tsx`, `client/src/vendor/ui/charts/LineChart.test.tsx`,
  `client/src/components/EvalTrendChart/{EvalTrendChart.tsx, helpers.ts, styles.ts, index.ts, EvalTrendChart.test.tsx, _components/TooltipBody/*}`,
  `client/src/lib/eval.ts`,
  `client/src/app/eval/[agentId]/_components/EvalAgentDetail/{constants.ts, helpers.ts}`,
  `…/EvalAgentDetail/_components/TrendChart/{TrendChart.tsx, TrendChart.test.tsx, styles.ts}`.
- **Done means:**
  - The new tests are green.
  - `git diff --stat -- "client/src/app/eval/[agentId]/_components/EvalAgentDetail/EvalAgentDetail.test.tsx"`
    is empty, and that file passes.
  - Every other existing client test that renders `LineChart` passes unchanged.
  - There are no hex or `rgb(` literals in the new files.
- **Verify:** `node scripts/verify.mjs client src/vendor/ui/charts/LineChart.test.tsx src/components/EvalTrendChart/EvalTrendChart.test.tsx "src/app/eval/[agentId]/_components/EvalAgentDetail"`
- **Rules that apply:**
  - FUA §1: two consumers → `src/components`; `vendor/ui` stays domain-free (LineChart knows nothing of evals).
  - FUA §3: no `renderThing()`.
  - react: no inline component definitions.
  - `client/INSIGHTS.md:50`: explicit ticks.
- **Risk:** medium (Recharts in jsdom).

#### W12 (L3b): Evals-tab "Metric trend" card
- **Serves:** AC-50…AC-57, NFR-2.
- **Do:**
  - **`EvalsTab/helpers.ts`:** add `evalsTabTrendPoints(runs: EvalSuiteRun[]): TrendTooltipPoint[]`. It keeps
    `status === "completed"`, sorts by `started_at` ascending and takes the last 20. It maps each run to
    `{run_id, started_at, agent_version, cost_usd, recall, precision, citation_accuracy}` and keeps null metrics
    as null.
  - **New `_components/MetricTrend/MetricTrend.tsx`** with props `{ runs, isLoading, isError }`:
    - `isError` → one line `trend.loadError` (AC-57);
    - `isLoading` → nothing (Assumption A6);
    - fewer than 2 points → one line `trend.notEnough` (AC-55);
    - otherwise `<EvalTrendChart points={…} dots />` (AC-50…AC-54).
  - **`EvalsTab.tsx`:** render `<MetricTrend runs={allRuns} isLoading={runs.isLoading} isError={runs.isError} />`
    in its own section **between** the EVAL METRICS section and the case list (AC-50). Polling already exists
    (`client/src/lib/hooks/eval.ts:83`), which gives AC-56.
  - **`MetricTrend.test.tsx`:**
    - AC-51: 6 runs (4 completed, 1 running, 1 failed) → 4 points in start-time order, with `dots` true;
    - AC-52: the domain is 0–1 with ticks `[0,0.2,0.4,0.6,0.8,1]`;
    - AC-53: a null precision at index k → series value `null` while the other two are numbers;
    - AC-55: 0 and 1 completed runs → hint, no chart;
    - AC-57: an error → error text, no chart;
    - AC-50: the three colours and legend labels.
    - Asserting on chart props is fine here: mock `LineChart` from `@devdigest/ui` the way
      `EvalAgentDetail.test.tsx:25` does.
  - **`EvalsTab.test.tsx`:**
    - AC-50: the card sits between the metrics and the case list (DOM order);
    - AC-56: the mocked runs response changes `running` → `completed` between polls, and the point count grows
      by one. Use fake timers or `refetch`, following the existing polling tests if any.
- **Files:** `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx, helpers.ts, styles.ts}`,
  `…/EvalsTab/_components/MetricTrend/{MetricTrend.tsx, MetricTrend.test.tsx, styles.ts, index.ts}`.
- **Done means:** both test files are green; the full client suite is green
  (`node scripts/verify.mjs client`).
- **Verify:** `node scripts/verify.mjs client` (L3's last item, so this is the lane-level run).
- **Rules that apply:** FUA §1 (one consumer → route-local); FUA §5 (server data from hooks, never copied into
  state); react (early returns for the loading/error/empty states).
- **Risk:** low.

---

## Execution

| Lane | Executor | Work items | Files (disjoint across parallel lanes) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| L1: contracts + DB | implementer | W1, W2, W3 | both `vendor/shared/contracts/eval-ci.ts`; `server/src/db/schema/eval.ts`, migration 0021 + `meta/`; `server/src/modules/eval/helpers/dto.ts`; `server/src/modules/eval/service.ts` (trend mapping only); `server/test/eval-manual-contracts.test.ts`, `server/test/fixtures/eval-case-diff-parity.json`, fixture fixes in existing `server/test/eval-*.ts` (never `eval-scoring.test.ts`); client `EvalCaseRow.tsx`, `EvalCaseModal.tsx`, `EvalsTab.test.tsx`, `EvalCaseModal.test.tsx` (null-safety/fixtures only) | — | — | **runs alone**: `pnpm db:generate` rewrites `migrations/meta`. It must not overlap the SPEC-06 lane's `pnpm install` either. |
| L2: server | implementer | W4, W5, W6, W7 | `server/src/modules/eval/{constants.ts, helpers/case-diff.ts, helpers/prompt.ts, run-executor.ts, repository.ts, service.ts, routes.ts}`; `server/test/{eval-paste-diff.test.ts, eval-manual-cases.it.test.ts, eval-manual-run.test.ts}` | L1 | L3 | shared tree |
| L3a: client, phase 1 | implementer | W8, W9, W10 | `client/src/lib/{eval-case-diff.ts, eval-case-diff.test.ts, eval.ts, eval.test.ts, hooks/eval.ts}`; `client/messages/en/eval.json`; `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx, styles.ts}`; `…/EvalCaseModal/**`; `…/EvalCaseRow/**` | L1 | L2 | shared tree |
| L3b: client, phase 2 | implementer | W11, W12 | `client/src/vendor/ui/charts/{LineChart.tsx, LineChart.test.tsx}`; `client/src/components/EvalTrendChart/**`; `client/src/lib/eval.ts`; `…/EvalAgentDetail/{constants.ts, helpers.ts}`, `…/TrendChart/**`; `…/EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx, helpers.ts, styles.ts}`, `…/EvalsTab/_components/MetricTrend/**` | L3a (shares `EvalsTab.tsx`, `EvalsTab.test.tsx`, `lib/eval.ts`, `styles.ts`) | L2 | shared tree |

Schedule: **L1 → { L2 ∥ (L3a → L3b) }**.

- L1 shares a few client files with L3a, and `service.ts` with L2. Those overlaps are **serialized** by the
  explicit dependency. No two **parallel** lanes share a file.
- L2 (server only) and L3 (client only) are disjoint by package.
- The parity JSON is created in L1 and only **read** afterwards.

Each executor is dispatched with this plan's path **and its lane id** (L3a and L3b are separate dispatches), and
touches only its lane's files.

**Integration** happens in the main session, after L2 and L3b, and **after the SPEC-06 lane has landed**:
1. In `server/package.json`, append `test/eval-manual-contracts.test.ts test/eval-paste-diff.test.ts test/eval-manual-run.test.ts test/eval-manual-cases.it.test.ts`
   to the `verify:l06` script (`server/package.json:17`). Edit this one line only, on top of SPEC-06's version of
   the file. Do not run `pnpm install`; no dependency changes.
2. Run the full Verification plan below.
3. Cross-lane checks:
   - both vendor copies are identical (the sync tests);
   - the `POST /agents/:id/eval/cases` route answers the client hook's body shape. Do this as a manual smoke on
     the dev stack: create a manual case through the UI, run the suite, and see the row, the "manual" badge
     and the trend;
   - no hex or `rgb(` literal in the files L3 touched (NFR-5);
   - compare against `screen_cizruns.jsx:56-96`, `screen_agents.jsx:135-144` and screenshots
     `4-agent-evals-tab.webp`, `5-eval-case-modal.webp` (NFR-5);
   - paste a 200 KB diff and measure the preview time in the browser performance panel, target < 1 s (NFR-7).

---

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | typecheck clean · unit suite green · arch:check no new violation |
| `node scripts/verify.mjs server --it` | repo root | — | integration lane green with Docker running, **0 skipped** |
| `pnpm verify:l06` | `server/` | pnpm | exits 0 with Docker running; includes the four new SPEC-05 files (after Integration step 1) |
| `node scripts/verify.mjs client` | repo root | — | typecheck clean · unit suite green |
| `pnpm build` | `client/` | pnpm | builds. Stop `pnpm dev` first, then `rm -rf client/.next`, then restart dev (`client/INSIGHTS.md:26,45`). |
| `node scripts/verify.mjs specs` | repo root | — | specs guard green (cheap; `specs/` has uncommitted changes in the tree) |

---

## Assumptions

- **A1:** Manual cases are stored in `eval_cases` with `origin = 'manual'` and NULL
  `source_pr_number`/`source_repo`/`labels`/`source_finding_id`. The unique `(agent_id, source_finding_id)`
  index never collides on NULL (`server/src/db/schema/eval.ts`, comment on `agentFinding`).
- **A2:** The 200 KB diff cap is measured on the text as sent, before CRLF normalisation, in both packages. In
  the browser the textarea already normalises line breaks to LF, so the two measure the same string in
  practice. The parity fixture pins the boundary.
- **A3:** The file count is `max(#lines starting "diff --git", #lines starting "+++ ")`. A path comes only from the
  first `+++ ` header. This matches the server parser, which treats any `+++ ` line as a header
  (`diff-parser.ts:39-43`).
- **A4:** The stored diff of a manual case is `buildCaseDiff(path, <from first @@>)`, so the pasted
  `index`/`---` lines are discarded. `---` content is not needed by the parser (`diff-parser.ts:45`).
- **A5:** The preview drops `\ No newline at end of file` lines, so the viewer does not number them (Spec
  follow-up 3). Stored text keeps them.
- **A6:** While the runs query is loading, the trend card renders nothing (neither the hint nor the chart), so
  the hint does not flash.
- **A7:** `EvalTrendPoint.run_id/agent_version/cost_usd` are optional on the wire but always sent by the server.
  A missing version shows "—" in the tooltip.
- **A8:** The tooltip and keyboard state lives inside `LineChart`, behind the optional `tooltip` prop.
  `vendor/ui` stays domain-free; eval formatting lives in `EvalTrendChart` / `lib/eval.ts`.
- **A9:** A Zod failure on any eval route answers 422 `validation_error` through the app error handler
  (`server/src/app.ts:133,158`). W6 asserts it.
- **A10:** No new npm dependency is needed in any package.

## Open questions

None.

## Research used

None. No `researcher` was dispatched. Facts not verified while planning are written as checks in the items'
**Done means**:
- drizzle `check()` availability (W2);
- `DiffFocus` shape (W9);
- TextEncoder in jsdom (W8);
- Recharts hover in jsdom (W11);
- the `validation_error` mapping (W5/W6).

## Rollback / blast radius

- **Files:** reverting the commits restores SPEC-04 behaviour. The client and server code paths are additive,
  except the `EvalCaseUpdate` widening and the `evalPrDescription` return type.
- **Migration 0021 is not reverted by reverting files.** The column and the relaxed NOT NULLs stay in the DB.
- If manual cases were created, a reverse migration must first delete them
  (`DELETE FROM eval_cases WHERE origin = 'manual'`). Only then can it restore NOT NULL and drop `origin`, via
  `pnpm db:generate` after reverting the schema.
- Never `docker compose down -v` (root `CLAUDE.md`).
- Seeded data is untouched (DR-24).
