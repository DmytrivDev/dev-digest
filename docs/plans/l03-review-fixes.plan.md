# Plan: L03 mentor-review fixes — intent runLog detail, visible Recalculate, two missing subagents

**Goal** — After this change (1) a review's Live Log shows the intent model, a prompt-token
estimate, one line per intent source and the actual token usage as separate entries (and a
cache hit says so per line); (2) a loaded Intent card has a visible, labelled **Recalculate**
button that POSTs `{ force: true }`; (3) `.claude/agents/` contains `security-reviewer.md` and
`brainstorm.md`, and the agent pipeline is written down.

**Branch** — `feat/l03-review-fixes` (already cut from `main` @ 8352926). Read
`docs/git-workflow.md` before any commit/push (root `CLAUDE.md`, "Before commit / push / PR").

**In scope**
- Server: `IntentService.derive` reports usage + a pre-call hook; `run-executor.buildIntentBlock`
  emits separate runLog entries; unit + integration tests.
- Client: Recalculate button on the loaded `IntentCard`, two i18n keys, component + hook tests.
- Agents: two new `.claude/agents/*.md`, one-line cross-references in `planner.md` and
  `implementer.md`.

**Out of scope**
- Surfacing usage on `POST /pulls/:id/intent` (see Assumptions A4).
- Persisting/exposing `tokens_in`/`tokens_out` on the `PrIntentRecord` DTO.
- The empty-state "Derive intent" CTA and the error-state retry (unchanged, non-force).
- Pre-existing debt in `reviews/` (its `service.ts` takes `Container` — known debt, onion §5).
- Architecture review and security review are performed by separate agents and are not
  this plan's concern.

## Affected surface

Skills resolved from `.claude/skills/pr-self-review/routing.json` (glob OR content trigger on
added lines — `collect-diff.mjs:436-439`).

| File | New/Mod | Package | Ring / home | Skills that will govern it | Constraint to respect |
|---|---|---|---|---|---|
| `server/src/modules/intent/helpers.ts` | Mod | api | Core (ring 1) — matches RING1 filename rule | onion-architecture (+ security if an added line contains `token`) | Stays pure: no import from `adapters/`, db client or container — `core-not-to-io` guards this file **by filename** (`server/INSIGHTS.md:47`, `server/.dependency-cruiser.cjs:23,43`). Only `import type` from `@devdigest/shared` |
| `server/src/modules/intent/service.ts` | Mod | api | Application (ring 3) | onion-architecture, security | Takes ports / plain functions, never `Container`, never an adapter import (`service.ts:4-9`; `server/INSIGHTS.md:39`). Do NOT import `approxTokens`/`TiktokenTokenizer` from `adapters/tokenizer` — that is `service-not-to-adapters` (ban 2); inject a count function instead, the precedent is `countPromptTokens(assembly, count)` (`reviews/helpers.ts:241`) |
| `server/src/modules/intent/routes.ts` | Mod | api | Adapter (ring 4) | onion-architecture, security, fastify-best-practices | Composition stays in `makeService` (`routes.ts:41-48`); response shape `{ intent }` unchanged |
| `server/src/modules/reviews/helpers.ts` | Mod | api | Core (ring 1) | onion-architecture (+ security via `token` content trigger) | Pure string builders only; `import type` from `@devdigest/shared` |
| `server/src/modules/reviews/run-executor.ts` | Mod | api | Application-ish orchestration (not a `service.ts`) | onion-architecture (+ security / typescript-expert only via content triggers) | Best-effort: every new line sits INSIDE the existing `try` that wraps `runLog.step` (`run-executor.ts:~389-402` doc comment, `~455-474` catch) — nothing new may reach `failAll` |
| `server/test/intent-helpers.test.ts` | Mod | api | test (unit, no DB) | none by glob — **coverage gap** (see below) | unit, no Docker |
| `server/test/reviews-helpers.test.ts` | Mod | api | test (unit, no DB) | none by glob — coverage gap | unit, no Docker |
| `server/test/intent.it.test.ts` | Mod | api | test (integration) | none by glob — coverage gap | keeps `.it.test.ts` suffix (root `CLAUDE.md` Naming) |
| `client/messages/en/brief.json` | Mod | web | i18n namespace `brief` | frontend-ui-architecture | Add key in the same change as the string — a missing key renders raw (`client/INSIGHTS.md:32`) |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx` | Mod | web | route-local `_components/` | frontend-ui-architecture, react-best-practices | Use vendored `Button` from `@devdigest/ui` (`vendor/ui/primitives/Button.tsx`, `loading` disables it at `:71`) — no new primitive; accessible name must differ from "Derive intent" (`client/INSIGHTS.md:48`) |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.test.tsx` | Mod | web | colocated test | react-testing-library | No `user-event` in repo — use `fireEvent` (`client/INSIGHTS.md:47`) |
| `client/src/lib/hooks/reviews.test.ts` | Mod | web | colocated hook test | react-testing-library, react-best-practices (`client/src/lib/hooks/**` glob, `.test.ts` not excluded) | fetch is mocked in client tests — mock `@/lib/api`, never hit the network |
| `.claude/agents/security-reviewer.md` | New | repo tooling | agent definition | none — **coverage gap** (`**/*.md` unrouted) | house frontmatter format (`architecture-reviewer.md:1-5`) |
| `.claude/agents/brainstorm.md` | New | repo tooling | agent definition | none — coverage gap | same |
| `.claude/agents/planner.md` | Mod | repo tooling | agent definition | none — coverage gap | one line only |
| `.claude/agents/implementer.md` | Mod | repo tooling | agent definition | none — coverage gap | one line only (`implementer.md:109-111`) |

**Coverage gaps:** `server/test/*.ts` is matched by no glob (`onion-architecture` globs only
`server/src/**`) — the three server test files are reviewed by `/pr-self-review` only if an
added line hits a content trigger. All four `.claude/agents/*.md` files are unrouted by design
(`routing.json:199-209`, `**/*.md`) — no domain reviewer looks at them; `plan-verifier` is the
only check on W5–W7.

## Contract changes

- **vendor/shared:** **no.** `DeriveResult`/`DeriveOptions` are server-internal types in
  `modules/intent/service.ts`; `PrIntentRecord` is unchanged; the POST response stays
  `{ intent: PrIntentRecord }`.
- **Migration:** **no.** `pr_intent` already stores `tokens_in`/`tokens_out`/`cost_usd`
  (`intent/repository.ts` `upsert`); nothing new is persisted.
- **Seed:** **no.** No new rows; the seeded `pr_intent` row (`source_key: ''`) behaves as before.
- **Client build check needed:** **no.** No new value import from `@devdigest/shared`
  (`Button` comes from `@devdigest/ui`, already value-imported in this file). `pnpm build` is
  therefore not required (`client/INSIGHTS.md:22`); run it only if the implementer ends up
  adding a value import from `@devdigest/shared` anyway.
- **i18n:** **yes** → `client/messages/en/brief.json`: `intent.recalculate` = `"Recalculate"`,
  `intent.recalculating` = `"Recalculating…"`.

## Work items

### W1 — `IntentService.derive` reports model, estimate and usage
- **Do:**
  1. `intent/helpers.ts`: add pure `estimatePromptTokens(messages: readonly ChatMessage[], count: (text: string) => number): number` = sum of `count(m.content)` over messages. `import type { ChatMessage }` from `@devdigest/shared`.
  2. `intent/service.ts`:
     - `IntentDeps` gains **required** `countTokens: (text: string) => number` (same injection
       shape as `countPromptTokens`; keeps the tokenizer adapter out of ring 3).
     - New exported `DerivePlan { provider: Provider; model: string; promptTokensEstimate: number; sources: readonly IntentSource[] }`.
     - `DeriveOptions` gains optional `onBeforeModelCall?: (plan: DerivePlan) => void`.
     - New exported `DeriveUsage { provider: Provider; model: string; promptTokensEstimate: number; tokensIn: number; tokensOut: number; costUsd: number | null }`.
     - `DeriveResult` gains `usage: DeriveUsage | null` — `null` on the cache-hit return
       (`service.ts:114`), populated on both fresh returns (persisted `:225` and not-persisted `:240`).
     - After `buildIntentMessages` (`:205`) and **before** `this.deps.llm(...)` (`:206`):
       compute the estimate, then call `opts.onBeforeModelCall?.(plan)` inside its own
       `try { } catch { }` — an observer must never fail a derivation.
     - `tokensIn`/`tokensOut`/`costUsd` come from the `StructuredResult` already in hand (`:207`).
  3. `intent/routes.ts` `makeService`: pass `countTokens: (text) => container.tokenizer.count(text)`.
  4. `reviews/run-executor.ts` `new IntentService({...})` (`:411-417`): pass the same
     `countTokens`. (Only this one line in W1 — the logging is W2 — so the tree typechecks.)
- **Files:** `server/src/modules/intent/helpers.ts`, `server/src/modules/intent/service.ts`, `server/src/modules/intent/routes.ts`, `server/src/modules/reviews/run-executor.ts`, `server/test/intent-helpers.test.ts`
- **Done means:**
  - `grep -n "adapters/" server/src/modules/intent/service.ts server/src/modules/intent/helpers.ts` returns nothing.
  - `intent-helpers.test.ts` has a `describe('estimatePromptTokens')` asserting it sums the injected counter over every message (e.g. counter `t => t.length` on two messages of 3 and 5 chars → 8) and calls the counter once per message.
  - `pnpm typecheck` clean in `server/`.
- **Verify:** `pnpm typecheck` and `pnpm exec vitest run test/intent-helpers.test.ts` in `server/`; `pnpm arch:check` in `server/` shows no new violation vs. the count taken on `main` before starting.
- **Rules that apply:** onion-architecture → §1 (ring 1 pure, test-speed ring), §3 ban 2 (service must not import a concrete adapter), §4 (inject what you need, not `Container`).
- **Risk:** low. The only public shape change is additive; both `derive()` callers are in this plan (`routes.ts:69`, `run-executor.ts:421`).

### W2 — Separate runLog entries in `buildIntentBlock`
- **Do:**
  1. `reviews/helpers.ts`: add pure line builders (exact text, so tests can pin it):
     - `intentModelLine(model: string | null, cached: boolean)` → `intent: model <model ?? "unknown">` + (cached ? ` (cached)` : ``)
     - `intentEstimateLine(n: number)` → `intent: prompt ≈ <n> tokens (estimate, before the call)`
     - `intentSourceLine(s: IntentSource, cached: boolean)` → `intent: source <kind>[ <ref>] — resolved` or `— not resolved[: <detail>]`, + ` (cached)` when cached
     - `intentUsageLine(u: { tokensIn: number; tokensOut: number; costUsd: number | null })` → `intent: usage — <in> tokens in / <out> out · $<cost.toFixed(4)>` or `· cost unknown` when `costUsd` is null
  2. `run-executor.ts` `buildIntentBlock`:
     - Pass `{ onBeforeModelCall: (p) => { runLog.info(intentModelLine(`${p.provider}/${p.model}`, false)); runLog.info(intentEstimateLine(p.promptTokensEstimate)); for (const s of p.sources) runLog.info(intentSourceLine(s, false)); } }` as `derive`'s third argument — these lines land between `Deriving PR intent…` and `… done`, i.e. while the model is still running, and they are already in the log if the call then fails.
     - Fresh path, after `step` returns: `runLog.info(intentUsageLine(result.usage))` (guarded on `result.usage`); keep the `derived but could not be persisted` line.
     - **Remove** the aggregate `intent: N source(s) resolved — kinds · confidence X` line and the unresolved-only loop (`run-executor.ts:~428-438`) — superseded by the per-source lines; confidence stays in the existing `Intent ready — <tier> confidence` result line.
     - Cache-hit path: keep `intent: reused stored derivation (source key unchanged)`, then `intentModelLine(result.record.model, true)` and `intentSourceLine(s, true)` for every `result.record.sources`. No estimate / usage line (no call was made).
     - All events stay `info` (an unresolved source is a normal outcome, not a fault — `docs/plans/intent-layer.plan.md` §7.1). `toolCall` and the catch block are unchanged.
  3. Tests:
     - `server/test/reviews-helpers.test.ts`: one `describe` per builder — resolved/unresolved/with-and-without detail/cached suffix; `costUsd: null` → `cost unknown`.
     - `server/test/intent.it.test.ts`, new test "a fresh derivation logs model, estimate, each source and usage as separate entries; a cached one flags them cached": use `ReviewRunExecutor.executeRuns` exactly like the existing R2 tests (`intent.it.test.ts:~445-455`), with one `MockLLMProvider` answering both schemas (`structuredBySchema: { PrIntent: INTENT_FIXTURE, Review: REVIEW_FIXTURE }`) registered for the provider(s) the intent feature model and the agent use; read `reviewRepo.getRunTrace(...)!.log`. Assert for run 1: indices of `intent: model `, `intent: prompt ≈`, the first `intent: source ` line, and `intent: usage — 100 tokens in / 50 out` (mock values, `adapters/mocks.ts:~98-100`) are strictly increasing; the count of `intent: source ` lines equals the persisted `pr_intent.sources` length; no line matches `source\(s\) resolved`. Then a second agent run on the same PR (new `createAgentRun`) → its log contains `reused stored derivation`, a `intent: model … (cached)` line, every `intent: source ` line ends with `(cached)`, and there is **no** `intent: prompt ≈` or `intent: usage` line.
     - Extend the existing "a dead model id during a review is LOUD" test (`intent.it.test.ts:~471`): the `intent: model ` line appears **before** the `intent: SKIPPED` line — the diagnosis now names the model that failed.
- **Files:** `server/src/modules/reviews/helpers.ts`, `server/src/modules/reviews/run-executor.ts`, `server/test/reviews-helpers.test.ts`, `server/test/intent.it.test.ts`
- **Done means:** the two unit `describe`s and the new/extended `.it` assertions above exist and pass; `grep -n "source(s) resolved" server/src` returns nothing; the R2 test (missing key → run `done`, no intent block) still passes unchanged.
- **Verify:** in `server/`: `pnpm typecheck`; `pnpm exec vitest run test/reviews-helpers.test.ts`; `pnpm exec vitest run test/intent.it.test.ts` (Docker); `pnpm arch:check`.
- **Rules that apply:** onion-architecture → §1 (log wording as ring-1 functions so it is unit-testable without Postgres); `server/CLAUDE.md` "Context enrichment is best-effort: on error/unindexed, omit the section, don't throw"; security → A09 logging: do not add the PR body, issue body or any secret to a log line (only kind/ref/detail, which were already logged for unresolved sources).
- **Risk:** medium-low. A throwing observer or a new line placed outside the `try` would turn a best-effort step into a run failure — the try/catch in W1 and placement inside the existing `try` are what prevent it. Log text is now pinned by tests, so wording changes later will need test updates (intended).

### W3 — Visible "Recalculate" button on the loaded Intent card
- **Do:**
  1. `client/messages/en/brief.json` under `intent`: `"recalculate": "Recalculate"`, `"recalculating": "Recalculating…"`.
  2. `IntentCard.tsx` loaded state (`:79-83`): replace the icon-only `IconBtn` with
     `<Button size="sm" kind="ghost" icon="RefreshCw" loading={derive.isPending} onClick={() => derive.mutate(true)}>{derive.isPending ? t("intent.recalculating") : t("intent.recalculate")}</Button>`.
     Import `Button` from `@devdigest/ui`; drop `IconBtn` from the import if now unused. `loading` already disables the button and spins the icon (`Button.tsx:23,71`). No inline error UI: a failure (incl. the route's 5/min 429, `intent/routes.ts:65`) is surfaced once by the global `MutationCache.onError` toast (`client/INSIGHTS.md:23`); adding an inline message would duplicate it.
  3. Footer freshness: no code change. `useDerivePrIntent` already invalidates `["pr-intent", prId]` on success (`lib/hooks/reviews.ts:126`) and `formatWhen` renders to the second (`lib/datetime.ts`), so `Derived <when> · <model>` visibly changes after a recalculation.
  4. Tests:
     - `IntentCard.test.tsx`: make the hook mock's `isPending` controllable (e.g. a `let derivePending = false` read by the mock factory). New cases: (a) loaded state → `getByRole("button", { name: "Recalculate" })` exists, `queryByRole("button", { name: "Derive intent" })` is null, clicking it calls `deriveMutate` with `true`; (b) `isPending: true` → `getByRole("button", { name: /Recalculating/ })` is disabled. Existing `expectNoRawKeys` still passes.
     - `client/src/lib/hooks/reviews.test.ts`: `vi.mock("@/lib/api")`; `renderHook(() => useDerivePrIntent("pr-1"), { wrapper })` with a fresh `QueryClientProvider`; `mutate(true)` → `api.post` called with `("/pulls/pr-1/intent", { force: true })`; `mutate(undefined)` → called with `("/pulls/pr-1/intent", undefined)`; after success, `["pr-intent","pr-1"]` is invalidated (`qc.getQueryState(...).isInvalidated`, same technique as the existing test in that file).
- **Files:** `client/messages/en/brief.json`, `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.test.tsx`, `client/src/lib/hooks/reviews.test.ts`
- **Done means:** `grep -n "IconBtn" <IntentCard.tsx>` returns nothing; `grep -n '"recalculate"' client/messages/en/brief.json` returns one line; the four new test cases exist and pass; `pnpm typecheck` and `pnpm test` in `client/` are green.
- **Verify:** `pnpm typecheck` and `pnpm test` in `client/`.
- **Rules that apply:** frontend-ui-architecture → §1 (search `src/vendor/ui` before building a primitive), §7 (i18n key added with the string); react-best-practices → Accessibility (button has a text label, not icon-only); react-testing-library → query by role/accessible name.
- **Risk:** low. Label collision trap (`client/INSIGHTS.md:48`) avoided by the distinct name, asserted in test (a).

### W4 — `.claude/agents/security-reviewer.md`
- **Do:** Create, following `architecture-reviewer.md`'s house format and structure:
  - Frontmatter: `name: security-reviewer`; quoted one-line `description` (read-only security review of a **named scope** — module/dir/route segment — against `.claude/skills/security`; returns file:line, rule, failure scenario; not a diff reviewer because `/pr-self-review` already routes `security` on diffs); `tools: Read, Grep, Glob`; `model: opus`.
  - "Why this exists / not a second pr-reviewer" — same D1 reasoning as `architecture-reviewer.md` §"Why this agent exists": `routing.json:41-65` already routes `security` over routes/services/adapters/config/prompts + content triggers on every diff; this agent covers scopes no diff touched.
  - "Why three tools": no Bash, no `Skill`; reads `.claude/skills/security/SKILL.md` and `checklists.md` **by path**.
  - What to check, repo-specific (the skill is generic OWASP with MongoDB/Express/Gemini sections — tell the agent to skip non-applicable sections):
    1. Secrets — only `LocalSecretsProvider` reads them (`server/CLAUDE.md` Gotchas; `server/src/adapters/secrets/local.ts:16`); no secret in logs/DB/git; fixture keys use the `sk_live_xxx` placeholder (`server/INSIGHTS.md:78`).
    2. Prompt injection — untrusted text reaches a prompt only through `wrapUntrusted` (`reviewer-core/src/prompt.ts:16,30`); imported/community skills are wrapped, manual ones deliberately not (`server/INSIGHTS.md:40`).
    3. SSRF & path traversal — any path/URL from PR text passes a safety gate (`intent/helpers.ts:158` `isSafeDocPath`); no fetch of an attacker-controlled URL.
    4. AuthZ & workspace scoping — every read resolves workspace first; tables without `workspace_id` (`findings`, `skill_versions`, `agent_versions`) inherit tenancy transitively and must never be queried by a bare id (`server/INSIGHTS.md:34,41`).
    5. Rate & body limits — global 120/min and `bodyLimit: 1_048_576` (`server/src/app.ts:49,96`); every synchronous model-backed route carries its own tighter `rateLimit` (`intent/routes.ts:65`, conventions extract).
  - Severity: house scale CRITICAL/WARNING/SUGGESTION (as `architecture-reviewer.md` §Severity), with a stated mapping from the skill's scale (skill CRITICAL/HIGH with a named exploit path → CRITICAL; MEDIUM → WARNING; LOW → not reported unless asked, per the skill's own "Do not report"). Every CRITICAL names the attacker-controlled input and the path it takes.
  - Output: markdown report with `## Scope reviewed`, `## Findings` (table: Severity | file:line | Rule | Failure scenario | Suggestion), `## Checked and clean`, `## Not checked` (mandatory, never empty by omission — e.g. runtime config, dependency CVEs it cannot query).
  - One line stating the pipeline: `brainstorm → planner → implementer → (architecture-reviewer ∥ security-reviewer ∥ plan-verifier) → /pr-self-review before push`.
  - Never runs `/engineering-insights` (same clause as `architecture-reviewer.md` Quality bar).
- **Files:** `.claude/agents/security-reviewer.md`
- **Done means:** file exists; `head -6` shows `name: security-reviewer`, a double-quoted `description:`, `tools: Read, Grep, Glob`, `model: opus`; `grep -c "Not checked\|wrapUntrusted\|workspace\|rateLimit\|LocalSecretsProvider" .claude/agents/security-reviewer.md` ≥ 5; `grep -n "Skill\b" ` finds no `Skill` in the `tools:` line.
- **Verify:** the greps above from repo root; then one smoke dispatch (`Agent`, `subagent_type: security-reviewer`, prompt "Scope: server/src/modules/intent/") — a new agent file registers mid-session without restart (`server/INSIGHTS.md:66`) — and confirm the report carries all four sections.
- **Rules that apply:** unrouted (coverage gap); house format per `.claude/agents/architecture-reviewer.md:1-5`.
- **Risk:** low (tooling only). The smoke dispatch costs one opus run; skip it if budget matters and say so in the report.

### W5 — `.claude/agents/brainstorm.md`
- **Do:** Create:
  - Frontmatter: `name: brainstorm`; quoted one-line `description` (pre-planner: turns a raw idea into 2–4 solution options with trade-offs, risks, open questions for the user and a recommendation; hands off to `planner`; writes nothing); `tools: Read, Grep, Glob, WebSearch, WebFetch`; `model: opus`.
  - Body: position in the pipeline (same line as W4); inputs (a raw idea, possibly vague — unlike `planner`, which stops at Step 0 on vagueness, brainstorm's job is to make it plannable); read the relevant package `INSIGHTS.md`/`CLAUDE.md`/`specs/` first (root `CLAUDE.md` "Before answering"); ground each option in the repo (does it already exist — `server/INSIGHTS.md:38` "grep db/schema, vendor/shared/contracts, reviewer-core/src/prompt.ts first"); external facts only with a cited URL + date; never write a file, never plan file-by-file placement (that is `planner`), never implement.
  - Output format: `## Problem as understood`, `## Options` (2–4, each: approach, touches server/client/both, contracts touched — vendor/shared / migration / seed, trade-offs, risks, rough size), `## Recommendation` (one option + why), `## Open questions for the user` (each with the default that would be assumed — mirrors `planner.md` Step 0), `## Handoff to planner` (a one-paragraph brief the caller can pass to `planner` verbatim).
- **Files:** `.claude/agents/brainstorm.md`
- **Done means:** file exists; `head -6` shows `name: brainstorm`, quoted `description:`, `tools: Read, Grep, Glob, WebSearch, WebFetch`, `model: opus`; `grep -c "## Options\|## Recommendation\|## Open questions\|## Handoff to planner" .claude/agents/brainstorm.md` = 4; no `Write`/`Edit`/`Bash`/`Agent` in the `tools:` line.
- **Verify:** the greps above from repo root.
- **Rules that apply:** unrouted (coverage gap); house format.
- **Risk:** low.

### W6 — Cross-reference the new roles from `planner.md` and `implementer.md`
- **Do:** Exactly one line each:
  - `planner.md`, directly under the `# Planner` intro paragraph: "Upstream, `brainstorm` may hand you an options brief — treat its recommendation as the request, not as a plan; Step 0 still applies."
  - `implementer.md:109-111` ("That review is a separate agent's job…"): name them — "…a separate agent's job (`security-reviewer`, `architecture-reviewer`, then `/pr-self-review`)…".
  - **Justification:** without these, the pipeline is stated only inside the two new files; the adjacent roles would still describe their neighbours anonymously, and a caller reading `planner.md` would not learn that a brainstorm brief is a legitimate input. One line each keeps the change inside what the mentor asked for; `plan-verifier.md`, `architecture-reviewer.md` and the rest need nothing (they do not describe a pipeline neighbour).
- **Files:** `.claude/agents/planner.md`, `.claude/agents/implementer.md`
- **Done means:** `git diff --stat -- .claude/agents/planner.md .claude/agents/implementer.md` shows ≤ 2 insertions/changes per file; `grep -n "brainstorm" .claude/agents/planner.md` and `grep -n "security-reviewer" .claude/agents/implementer.md` each return one line; frontmatter of both files unchanged.
- **Verify:** the commands above from repo root.
- **Rules that apply:** unrouted (coverage gap).
- **Risk:** low. Editing a loaded agent definition mid-session may not be picked up by an already-running instance (`server/INSIGHTS.md:66`, untested for edits) — irrelevant to correctness.

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `pnpm typecheck` | `server/` | pnpm | clean |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server/` | pnpm | all green (baseline is fully green per `server/INSIGHTS.md:67`; any red is yours) |
| `pnpm exec vitest run .it.test` | `server/` | pnpm | green, incl. the new/extended tests in `intent.it.test.ts` (needs Docker) |
| `pnpm arch:check` | `server/` | pnpm | 0 errors; warn count not above the count measured on `main` before W1 (exits 0 on warnings — compare the number, `server/INSIGHTS.md:9`) |
| `pnpm typecheck` | `client/` | pnpm | clean |
| `pnpm test` | `client/` | pnpm | green |
| `pnpm build` | `client/` | pnpm | **only if** a value import from `@devdigest/shared` was added (not planned). Never while `pnpm dev` is running (`client/INSIGHTS.md:41`) |
| `/pr-self-review` | repo root | — | PASS (no CRITICAL) before push — root `CLAUDE.md` |

## Assumptions

- **A1** — Model/estimate/source lines are emitted **before** the model call via a callback, not after the fact, so a failed/timeout call still shows which model it was. If the implementer finds the callback awkward, the fallback is logging all of them after `step` returns — but then the dead-model assertion in W2 must be dropped.
- **A2** — The token estimate uses the same tokenizer as the run trace's `token_counts` (`container.tokenizer`, cl100k — `run-executor.ts:311`), injected as a function. For non-OpenAI models it is an approximation; the log line says "estimate".
- **A3** — On a cache hit, `usage` is `null`: `tokens_in/out` are in the table but not in `PrIntentRecord`, and widening the DTO would be a vendor/shared change for a log line. The cached log shows the stored model + sources flagged `(cached)` and no usage line.
- **A4** — `POST /pulls/:id/intent` does not surface usage: it has no runLog, its response contract is `{ intent }`, and cost is already on the record (`cost_usd`). Out of scope.
- **A5** — The aggregate `N source(s) resolved` line is removed (replaced by per-source lines). No test asserts it today (`grep "source(s) resolved" server/test` is empty).
- **A6** — No inline error on Recalculate; the global mutation toast is the single failure surface (`client/INSIGHTS.md:23`), and a 429 from the 5/min limit reads correctly there.
- **A7** — Both new agents use `model: opus` (judgement roles, matching `architecture-reviewer`/`planner`/`plan-verifier`).

## Open questions

None blocking. Decisions the caller may want to overrule are A1, A5 and A7.

## Rollback / blast radius

Revert-by-files only: no migration, no seed change, no contract change. Reverting W2 restores
the old aggregate log line; reverting W3 restores the icon-only button; reverting W4–W6 removes
the two agent types (any in-flight dispatch of them simply fails to resolve). Runs already
persisted keep whatever log lines they were written with — `run_traces.log` is historical and
is not rewritten.
