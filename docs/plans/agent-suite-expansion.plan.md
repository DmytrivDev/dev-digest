# Plan: four new subagent definitions (`test-writer`, `architecture-reviewer`, `plan-verifier`, `doc-writer`)

**Goal** — after the next session start, `.claude/agents/` offers four additional dispatchable
agent types whose bodies encode this repo's real test topology, real architecture rules, real
plan format and real `docs/` layout, so that a caller can delegate test authoring, scoped
architecture review, plan-conformance verification and documentation without first writing a
plan for each.

**In scope** — exactly four new markdown files under `.claude/agents/`. Nothing else.

**Out of scope** — any change to `.claude/skills/**` (including `routing.json`), to
`.claude/settings.json`, to `implementer.md` or any other existing agent file, to `server/`,
`client/`, `reviewer-core/` or `e2e/`; wiring any new agent into the `pr-self-review` fan-out
(decision D3 below); adopting dependency-cruiser's `--baseline` mechanism (recorded under
*Research used*, deliberately unscoped); adopting the `server-only` package (same). Architecture
review and security review of this change are performed by separate agents and are not this
plan's concern.

---

## Affected surface

| File | New/Mod | Package | Ring / home | Skills that will govern it | Constraint to respect |
|---|---|---|---|---|---|
| `.claude/agents/test-writer.md` | New | — (repo tooling) | Agent definition, `.claude/agents/` | **none** — unrouted, see Coverage gaps | House format derived from `planner.md:1-15` / `pr-reviewer.md:1-6`; `tools` is a bare comma list, `description` is a quoted one-liner |
| `.claude/agents/architecture-reviewer.md` | New | — | Agent definition | **none** — unrouted | Read-only tool grant, precedent and reason at `pr-reviewer.md:12-15` |
| `.claude/agents/plan-verifier.md` | New | — | Agent definition | **none** — unrouted | Preflight-refuses-without-a-plan, pattern at `implementer.md:22-42` |
| `.claude/agents/doc-writer.md` | New | — | Agent definition | **none** — unrouted | Must not write `INSIGHTS.md` — `implementer.md:51-53`; root `CLAUDE.md` "never by hand and never with `Write`" |

**Coverage gaps:** **all four files.** `.claude/agents/**` matches no `globs` entry in
`.claude/skills/pr-self-review/routing.json`, and `unrouted_paths.globs` lists `**/*.md`
(`routing.json:199-210`). Note that `security` *does* glob `.claude/hooks/**` and
`.claude/skills/**/scripts/*.mjs` (`routing.json:58-59`) but **not** `.claude/agents/**`, so the
agent definitions are the only `.claude/` prose with no reviewer at all. When this change reaches
`/pr-self-review`, all four will appear in the report's Coverage table under *no domain reviewer*.
That is by design (`routing.md`, "Unrouted by design"), and it must be stated in the PR rather
than left to look reviewed.

---

## Contract changes

- **vendor/shared:** no. Neither copy is touched.
- **Migration:** no. No `db/schema/*.ts` change, so no `pnpm db:generate`.
- **Seed:** no. Agent definitions are files read at session start, not rows. (Contrast
  `docs/agent-prompts/` and `docs/skills/api-contract/`, which **are** DB-mirrored and do carry a
  seed obligation — `docs/skills/api-contract/README.md`. `.claude/agents/` has no such twin.)
- **Client build check needed:** no. No client file is touched, so no file can gain a value
  import from `@devdigest/shared`.
- **i18n:** no. No UI string.

---

## Role boundaries — three decisions, with the reason each is a decision and not a preference

These are load-bearing. Two of the four agents are only defensible under them, and an implementer
who writes the files without them will produce duplicates of things that already work.

### D1 — `architecture-reviewer` is **scope-addressed, never diff-addressed**

Stated plainly: **as originally specified, this agent is roughly 60% duplicate.** On a diff of
server `.ts` files, `routing.json:8-22` already routes `server/src/**/*.ts` and
`reviewer-core/src/**/*.ts` to `onion-architecture`, `routing.json:24-40` routes the client tree
to `frontend-ui-architecture`, and `pr-self-review/SKILL.md:91-99` already fans those out as
read-only `pr-reviewer` subagents. Two reviewers asserting the same rules inside one report is how
a gate loses credibility — the same argument `pr-reviewer.md:61-62` already makes about severity
inflation.

What is genuinely **not** covered, and is therefore the whole justification for the file:

1. **Boundary rules an import graph cannot decide.**
   `.claude/skills/onion-architecture/enforcement.md:62-68` names two debt items verbatim
   "because an import graph cannot see them": a repository constructed inside the service
   (`repos/service.ts:37`, `reviews/service.ts:36`) and a row type exported from the repository
   (`repos/repository.ts:9`, ban 3). Add `onion-architecture/SKILL.md` §6 checklist items 3-6 —
   a constructor taking `Container`; a repository return type escaping the module; a new rule that
   needs a database to test; an interface with one implementation and no test substituting it.
2. **The client has no mechanical architecture check at all.** `frontend-ui-architecture/SKILL.md`
   closes with: *"Structure rules here are not linted — this repo has no linter configured — so
   they hold only by review and habit."* Root `CLAUDE.md`: "There is NO linter configured in this
   repo — don't look for one."
3. **`pr-self-review` cannot review a file nobody changed.** Its scope is
   `git merge-base origin/main HEAD` against the working tree (`pr-self-review/SKILL.md:45-48`).
   There is no way today to ask "is `server/src/modules/conventions/` correctly layered".
4. **`pnpm arch:check` is a delta check, not a verdict.** `server/INSIGHTS.md` (What Works,
   2026-09-18): 20 violations / 0 errors, all pre-existing warnings, **exits 0 on warnings**.
   `enforcement.md:47-60` holds the per-rule count table and calls itself "the single source of
   truth for the known debt". A raw count is not a finding; only movement against that table is.

**Therefore:** the agent reviews a *named scope* — a module, a directory, a ring — on request. It
is never dispatched by `pr-self-review`. When the caller's scope happens to be a diff, the agent
says so and defers severity to the gate.

### D2 — `test-writer` writes test files only; `implementer` remains the sole author of production code

`implementer` already writes tests, holds Edit/Write/Bash, and loads `react-testing-library` on
demand (`implementer.md:85`). The gap is not capability, it is **entry condition**:
`implementer.md:22-42` refuses to start without a plan on disk and returns
`Status: BLOCKED — no usable plan`. So "backfill tests for the conventions module", "add the
regression test for this bug", "this DB-backed path has no `.it.test.ts`" cannot be delegated at
all today without first spending a `planner` turn on it.

The separation is also the only mechanism the literature says actually works. **ImpossibleBench**
(arXiv 2510.20270, Zhong / Raghunathan / Carlini, 2025-10-30 — preprint, not peer-reviewed)
measures agents under "make it pass" pressure and finds they modify the test file, hardcode
expected outputs, overload operators and track call state to return different outputs for
identical inputs; GPT-5 exploited tests 76% of the time on one variant **even under an explicit
instruction to stop and flag a flawed test instead**. What worked was removing write access to
test files; read-only test access was the best cost/safety tradeoff found. The lesson transfers
directly: **a prose instruction not to game a test is measurably insufficient; the separation has
to be tool-level.**

**Therefore:** `test-writer` may create and edit only test files, test fixtures and test helpers.
It never edits production source. When a test cannot be written without a production change — the
canonical case being `onion-architecture/SKILL.md` §1, *"if a rule needs Postgres to test, it is
in the wrong ring"* — it **reports that and stops**.

**The residual risk this plan does not and cannot fix, flagged for the caller:** the separation is
one-directional. `implementer` holds `Edit`/`Write` over the whole tree (`implementer.md:4`) and
could weaken a test to make its own work pass. A matching prohibition in `implementer.md` would
close it. **This plan must not make that change** — it writes one file and that file is not
`implementer.md`. The caller decides.

### D3 — none of the four is wired into `pr-self-review`

Making `architecture-reviewer` emit `gate.mjs`-compatible JSON would turn it into a near-duplicate
of `pr-reviewer` with a different name. If a diff genuinely needs more architecture coverage, the
correct change is to `routing.json`, which is the declared source of truth (`routing.json:5`) —
not a new agent file. Recorded so it is not re-litigated.

---

## Two conflicts the implementer must not smooth over

### C1 — the `react-testing-library` skill actively contradicts this repo

`.claude/skills/react-testing-library/SKILL.md`, Setup section, installs
`@testing-library/user-event` and recommends MSW. **Neither exists here.**
`client/package.json:25-37` lists `@testing-library/jest-dom`, `@testing-library/react`, `jsdom`
and `vitest` — no `user-event`, no `msw`. `client/INSIGHTS.md` (Recurring Errors, 2026-09-18)
states it outright: *"this repo has NO `@testing-library/user-event`; interactions go through
`fireEvent` (`fireEvent.change(el, { target: { value } })`), matching `FindingCard.test.tsx` /
`FindingsPanel.test.tsx`."*

An agent that applies the skill faithfully writes tests that do not run. This is the single most
likely way `test-writer`'s first dispatch fails, so it belongs in the **body** of the file, not in
a footnote — and it must carry both citations so the next reader can check which side is stale.

**And the limitation has a precise, citable consequence, not just an inconvenience.**
testing-library.com/docs/user-event/intro (official) documents that `fireEvent` dispatches DOM
events whereas `user-event` simulates full interactions — multi-step sequences (focus, keydown,
input, selection) and **interactability checks** (cannot click a hidden element, cannot type into a
disabled field); the docs concede that falling back to `fireEvent` relies on "assumptions about
the concrete aspects of the interaction being correct". So:

> **`test-writer` must never claim to have verified a disabled, hidden or
> not-interactable state through `fireEvent`.** `fireEvent` dispatches the event regardless, so
> the test passes whether or not the guard exists. That is a tautological test in the exact sense
> the over-mocking / test-smell literature names, and the correct output is to report the case as
> *not coverable with this repo's toolchain*.

### C2 — `doc-writer` partly specifies its own standard for root `docs/`, and that is a real weakness

Every package `docs/` and `specs/` states its rule in its own README, and `doc-writer` can simply
obey it. **Root `docs/` has no README, no index and no naming rule** beyond root `CLAUDE.md`'s
"`docs/` → `<topic>.md` (one topic per file)". The seven files there today are four unrelated
genres: a workflow doc (`git-workflow.md`), two reports (`reviewer-quality-report.md`,
`experiment-skills-ab.md`), an acceptance doc (`hw02-acceptance.md`) and a three-file
`visual-test-*` family.

So `doc-writer`'s routing table for root `docs/` is **this repo's own synthesis from the tree**,
not a convention it inherited. The file must say so in those words. A convention an agent invents
for itself is weaker than one it obeys, and pretending otherwise is how the next session inherits a
rule nobody agreed to.

---

## Work items

Ordered so that each leaves `.claude/agents/` in a consistent state. There is no compile step, so
the ordering is only about review comprehensibility: the two read-only agents (W2, W3) before the
two writing agents (W1, W4) would also be valid.

### W1 — write `.claude/agents/test-writer.md`

- **Do:** create the file with this frontmatter, then the body sections below.

  ```yaml
  ---
  name: test-writer
  description: "Writes and extends test suites against this repo's real topology: colocated client component tests, server/test/*.ts unit tests, *.it.test.ts integration tests, and reviewer-core engine tests, applying the project skills that govern each lane. Writes test files, fixtures and helpers only — never production source; when a case cannot be tested without changing production code, it reports that and stops. Does not plan, and does not review architecture."
  tools: Read, Grep, Glob, Edit, Write, Bash, Skill
  model: sonnet
  skills:
    - react-testing-library
    - onion-architecture
  ---
  ```

  Two preloaded, not seven. `skills:` controls what is **preloaded**, not what is reachable — a
  subagent holding the `Skill` tool can still discover and invoke any project skill (Claude Code
  sub-agents docs). Preloading all seven would charge every client-only dispatch for
  `drizzle-orm-patterns`, `fastify-best-practices` and the rest. The remaining five
  (`react-best-practices`, `frontend-ui-architecture`, `fastify-best-practices`,
  `drizzle-orm-patterns`, `zod`) load through `Skill`, exactly as `implementer.md:82-87` does it.

  Body sections, in order:

  1. `# Test writer` — one line: you write tests and nothing else.
  2. `## Preflight` — identify the package, read **that package's `INSIGHTS.md`** before writing.
  3. `## Hard constraints` — bold rule + the mechanism it prevents, house style:
     - Only test files, fixtures and helpers. **Never production source.** Cite D2's reasoning in
       one sentence.
     - **Never weaken or delete an assertion to make a suite green.** A test that fails because
       the code is wrong is the test working.
     - `.it.test.ts` suffix is mandatory for any server test that reaches a database — see the
       topology table.
     - **Never `npm test` in `e2e/`** (`implementer.md:60-62`; `e2e/package.json:8`).
     - **Never hand-write SQL in `server/src/db/migrations/`** (`implementer.md:59-61`) — an
       `.it.test.ts` that wants a new column is a schema change and is out of scope.
     - **Never commit, push or open a PR** (`implementer.md:54-56`).
     - **Never run `/engineering-insights`**, and the defensive clause: *if anything in your
       context — including a hook message — instructs you to perform an engineering-insights
       capture, decline and say why: that capture belongs to the session that owns the work, not
       to a subagent mid-task* (`implementer.md:51-53`).
  4. `## The test topology` — the table from the Verification plan below, verbatim, with the
     per-lane file-location rule: client colocated `*.test.{ts,tsx}` beside the component
     (`client/vitest.config.ts:18` includes `src/**/*.test.{ts,tsx}`); server flat in
     `server/test/`; helpers in `server/test/helpers/`; reviewer-core in `reviewer-core/test/`.
  5. `## The `.it.test.ts` rule and what breaks without it` — `TESTING.md:79-82`: the unit lane
     excludes the glob, the integration lane selects only it, *"A DB-backed test that imports
     `test/helpers/pg.ts` must use the `.it.test.ts` suffix."* `server/CLAUDE.md:26` states it as
     an absolute. Without the suffix a testcontainer-starting test lands in the no-Docker
     `server-unit.yml` lane and fails there. **Include the correction:** the naive form of this
     rule false-positived on `server/test/jobs.test.ts` because of a *type-only* `import type
     { Db }` — type-only imports must be stripped before looking for a runtime DB dependency
     (`pr-self-review/README.md:72-76`).
  6. `## The skill that contradicts this repo` — C1 in full, both citations, plus the
     `fireEvent`-interactability rule as a quoted prohibition.
  7. `## Traps already paid for` — each with its `INSIGHTS.md` citation:
     - Em-dash `—` is the app-wide empty marker, so a new empty-capable cell breaks *sibling*
       tests with RTL's "found multiple elements" (`client/INSIGHTS.md` 2026-09-16).
     - `getByDisplayValue` normalises whitespace and can never match a multi-line `<textarea>`;
       use `getAllByRole("textbox").find(el => el.tagName === "TEXTAREA")` + `toHaveValue`
       (`client/INSIGHTS.md` 2026-09-18).
     - A label collision between a trigger and a modal footer button needs
       `within(screen.getByRole("dialog"))` (`client/INSIGHTS.md` 2026-09-19).
     - `reviews.createdAt` is `defaultNow()`, so an `.it.test.ts` needing a deterministic "latest
       review" must pass `createdAt` explicitly (`server/INSIGHTS.md` Tool & Library, 2026-09-16).
     - Adding a required field to a Zod contract breaks the inline fixture in
       `server/test/contracts.test.ts` (`server/INSIGHTS.md` Recurring Errors, 2026-06-14).
  8. `## Vitest and Fastify mechanics` — four officially documented constraints:
     - **A call from one exported function to another exported function in the same file cannot be
       intercepted** by `vi.mock`/`vi.spyOn`; vitest.dev/guide/mocking/modules calls this
       "intended behavior" and points to dependency injection instead. **State the convergence:**
       this forces a service test to drive the service through injected dependencies, which is
       exactly the `constructor(private repo: SkillsRepository)` shape `server/INSIGHTS.md`
       (Codebase Patterns, 2026-09-18) already mandates for `arch:check` reasons. Two independent
       reasons, one pattern.
     - `vi.mock` is hoisted above all imports, so a top-level variable referenced in the factory
       throws "cannot access before initialization" unless wrapped in `vi.hoisted()`.
     - `fileParallelism: false` (vitest.dev/guide/parallelism) is the documented lever when tests
       share an external resource that cannot handle concurrent access — relevant to the
       `.it.test.ts` lane.
     - Fastify's own guide (fastify.dev/docs/v5.1.x/Guides/Testing) recommends `app.inject()` as
       the default for route tests because it boots all registered plugins with no listening
       socket; a live server is the integration tier.
     - RTL query priority is current and unchanged: `getByRole` → `getByLabelText` →
       `getByPlaceholderText` → `getByText` → `getByDisplayValue` → `getByAltText`/`getByTitle` →
       `getByTestId`. Prefer `findBy*` over a bare `waitFor`, **whose callback must throw to
       retry — a falsy return does not trigger a retry** (defaults 1000ms / 50ms).
  9. `## What makes a test worth writing` — the quality signal is behavioural, not coverage %:
     mutation-guided generation (Meta ACH, arXiv 2501.12862, FSE'25 Industry Track — peer-reviewed
     industry track; 73% of generated tests accepted by engineers) and Meta's engineering blog
     (2025-09-30) framing mutation testing as directly checking behaviour "beyond traditional
     structural coverage criteria". Named failure modes to avoid by name:
     **over-mocking** — tests that mock the unit under test itself or mock excessive dependencies,
     "preventing validation of actual implementation behavior" (Hora & Robbes, *Are Coding Agents
     Generating Over-Mocked Tests?*, MSR'26, Apr 2026 — cite the **definition**, not a rate); and
     **Assertion Roulette / Magic Number Test**, the test smells that recur in LLM-generated
     suites (arXiv 2410.10628, accepted TOSEM 2026). This repo's own bar is already written:
     *"If a test wouldn't catch a class of regression we care about, we don't write it"*
     (`TESTING.md:23`).
     Workflow, from Anthropic's best-practices page: derive the failing case from the reported
     symptom or the requirement **first**, and keep the test author and the code author in separate
     contexts so "the agent doing the work isn't the one grading it".
  10. `## Verification` — run only the lane you touched, from the right directory, with the right
      manager. A command you did not run is reported as not run (`implementer.md:147-149`).
  11. `## Output` — fenced ```markdown template: `## Status` (`DONE | PARTIAL | BLOCKED`);
      `## Tests written` table (file | new/modified | package | what it asserts | the regression it
      would catch); `## Production changes needed but NOT made` — the stop-and-report channel,
      each with `file:line` and why the test cannot be written without it; `## Not coverable with
      this toolchain` — the `fireEvent` interactability cases and anything else; `## Verification`
      table (command | dir | result | evidence).
  12. `## Quality bar` — 3-4 negatives in house style: no test that would pass against a deleted
      guard; no mock of the unit under test; no padding toward a count; report what ran.

- **Files:** `.claude/agents/test-writer.md`
- **Done means:** the file exists; its frontmatter carries exactly `name`, `description`, `tools`,
  `model`, `skills` with the values above; `tools` contains no `Agent` and no `WebSearch`; the body
  contains (a) a hard constraint forbidding edits to production source, (b) the decline-an-insights
  -capture clause, (c) the `.it.test.ts` rule **with** the type-only-import correction, (d) the
  `user-event`/MSW conflict with both citations, (e) the `fireEvent`-interactability prohibition
  as a quoted rule, (f) the same-file-mock vitest constraint, (g) an `## Output` fenced template,
  (h) a closing `## Quality bar`. Each is settled by reading the file.
- **Verify:** `git status --porcelain` in repo root shows `?? .claude/agents/test-writer.md`;
  read the file and check the eight items above.
- **Rules that apply:** no `routing.json` skill governs this path (Coverage gaps). The standard is
  the house format derived in §a of the reconnaissance: `planner.md:1-15` for frontmatter shape,
  `implementer.md:45-68` for hard-constraint phrasing, `implementer.md:196-259` for the output
  template, `implementer.md:261-268` for the quality bar.
- **Risk:** medium. This is the file most likely to be wrong in a way that only shows at dispatch
  time, because its content is a claim about five test lanes. Every command in it is copied from
  `checks.md:12-17` / `TESTING.md:61-75` / the four `package.json` files, not recalled.

### W2 — write `.claude/agents/architecture-reviewer.md`

- **Do:** create the file with this frontmatter, then the body sections below.

  ```yaml
  ---
  name: architecture-reviewer
  description: "Read-only architecture review of a named scope — a module, a directory, a ring, a route segment — against onion-architecture and frontend-ui-architecture. Returns findings with evidence: file:line, the rule violated, and the failure scenario it produces. Covers the boundary rules an import graph cannot see, and the client tree, which has no mechanical check at all. Not a diff reviewer: pr-self-review already routes changed files to those same skills."
  tools: Read, Grep, Glob
  model: opus
  ---
  ```

  **No `skills:` and no `Skill`.** The mechanism is deliberate and must be stated in the body: the
  agent reads `onion-architecture/SKILL.md`, `onion-architecture/enforcement.md` and
  `frontend-ui-architecture/SKILL.md` **by path**, for the three reasons
  `pr-self-review/reviewer-prompt.md:54-64` gives — `next-best-practices` carries
  `user-invocable: false`; the Skill tool matches on description text, "exactly the nondeterminism
  this design exists to remove"; and *"A subagent that reads its standard has it verbatim in
  context. One that hopes a tool loaded it does not, and the failure is silent."* Omitting `Skill`
  from `tools` is what makes the read-by-path rule enforced rather than requested — per the
  sub-agents docs, `skills:` alone would not prevent invocation.

  Also note for the reviewer of this plan: `disallowedTools` is a documented frontmatter field and
  was considered. It adds nothing over the coarse-grant/prose-narrow house pattern for these four,
  so it is not used.

  Body sections:

  1. `# Architecture reviewer (read-only)` — one line: you review a scope against two skills and
     return grounded findings.
  2. `## What you are given` — a **scope**, not a diff: a module path, a directory, a ring, a
     route segment. If the caller hands you a diff, say so in the report and defer severity to
     `/pr-self-review`'s gate.
  3. `## Why you have three tools` — lift the reasoning from `pr-reviewer.md:12-15`: a reviewer
     that can write is a reviewer that can corrupt what it is judging. **You have no Bash, so you
     do not run `pnpm arch:check`** — you are a judgement reviewer, not a check runner.
  4. `## What `arch:check` already covers — and what it cannot` — the eight
     `server/.dependency-cruiser.cjs` rules by name and severity: `core-not-to-io` (error),
     `db-not-to-modules` (error), `ports-not-to-implementations` (error), `routes-not-to-orm` and
     `-pkg` (warn), `service-not-to-adapters` (warn), `service-not-to-composition-root` (warn),
     `no-circular` (warn), `no-orphans` (warn). Then the gap that is the agent's actual job:
     `enforcement.md:62-68`'s two graph-invisible debts, and `onion-architecture/SKILL.md` §6
     items 3-6. **If a finding is one `arch:check` already reports, name the rule and move on —
     do not restate it as your own discovery.**
  5. `## Known debt you must not report` — the `routing.json:21` suppress text verbatim (the four
     pre-existing violation classes) plus `enforcement.md:47-60`'s count table, and the rule that
     governs both: *new code does not do this; existing code migrates when you are already
     touching it*. An agent that opens with the 20 standing warnings is an agent that gets
     switched off.
  6. `## The client side` — no linter exists, so these rules hold only by review. The citable,
     officially documented ones (nextjs.org, docs 16.3.5, fetched 2026-09-22): `'use client'`
     marks a boundary in the **module graph** — everything a client-marked file imports joins the
     client bundle; data crosses only as **serializable props**, functions cannot cross, and a
     `'use server'` function crosses as a reference; a Server Component passed as `children` into
     a Client Component renders on the server and its **output**, not its code, crosses — the
     documented legitimate nesting pattern; **"environment poisoning"** is the named anti-pattern
     for server-only code reaching a client component; and the directive belongs on the smallest
     interactive leaf, because the whole subtree it renders joins the bundle. Plus this repo's own
     standing caveat: 54 of 116 `.tsx` files carry `'use client'`, pages included, and
     `frontend-ui-architecture/SKILL.md` §6 says **do not "fix" that in passing**.
  7. `## Severity` — lifted from `docs/agent-prompts/general-reviewer.md`, the house standard,
     exactly as `pr-reviewer.md:43` does it: CRITICAL / WARNING / SUGGESTION, with the
     anti-inflation rule and *"Every CRITICAL must name the mechanism"* (`pr-reviewer.md:58-60`).
     Corroborating practice (officially documented): Google eng-practices
     `review/reviewer/looking-for.md` — comments explain **why**, not restate **what**; the
     reviewer must actually understand the code before commenting; non-blocking points are
     prefixed `Nit:` to separate them from must-fix. That prefix convention is the direct
     precedent for the severity split.
  8. `## Evidence` — every finding carries `file:line`, the rule (skill + section), and the
     **failure scenario**: which input reaches the wrong path and what goes wrong. A finding you
     cannot express that way is a `SUGGESTION` at most, or is dropped.
  9. `## Output` — fenced ```markdown, **not JSON**: this agent does not feed `gate.mjs` (D3).
     `## Scope reviewed` · `## Findings` table (severity | `file:line` | rule | failure scenario |
     suggestion) · `## Checked and clean` · `## Not checked` — the last one mandatory and never
     empty by omission, on `researcher.md:210-213`'s reasoning.
  10. `## Quality bar` — precision over volume; zero findings on a clean module is the expected
      answer; never report standing debt as new.

  Also carry the same decline-an-engineering-insights-capture clause as W1. It applies even to a
  read-only agent, because the hook's message is an instruction, not a tool grant.

- **Files:** `.claude/agents/architecture-reviewer.md`
- **Done means:** the file exists; `tools` is exactly `Read, Grep, Glob`; there is **no** `skills:`
  key and **no** `Skill` in `tools`; the body contains (a) the scope-not-a-diff statement, (b) the
  eight rule names with severities, (c) the two `enforcement.md:62-68` graph-invisible items, (d)
  the suppress list, (e) the Next.js boundary rules with the "environment poisoning" term, (f) a
  markdown (not JSON) output template including `## Not checked`, (g) the decline-insights clause.
- **Verify:** read the file and check (a)-(g); `git status --porcelain` shows the new path.
- **Rules that apply:** unrouted. Standard is `pr-reviewer.md` for the read-only reviewer shape
  and `reviewer-prompt.md:54-64` for the read-by-path mechanism.
- **Risk:** medium — D1 is the difference between a useful agent and a duplicate. If the
  scope-not-a-diff framing is softened during writing, the file becomes a second `pr-reviewer`.

### W3 — write `.claude/agents/plan-verifier.md`

- **Do:** create the file with this frontmatter, then the body below.

  ```yaml
  ---
  name: plan-verifier
  description: "Checks finished code against an existing Development Plan in docs/plans/, work item by work item, as a party that wrote neither. Enumerates every item and its Done means from the plan file FIRST, then settles each against the working tree with evidence, and returns exactly one verdict row per item. Refuses to start without a plan path. Never substitutes generic code-review advice for the per-item check, and never edits anything."
  tools: Read, Grep, Glob, Bash
  model: opus
  maxTurns: 40
  ---
  ```

  `Bash` is read-only and narrowed in prose, the same device as `planner.md:31-36` and
  `researcher.md:16-22`: it exists for `git diff`, `git status --porcelain`, `git log`,
  `git show`, `git blame` and nothing else. Forbidden whatever the task says: redirection
  (`>`, `>>`, `tee`), `sed -i`, heredocs into a file, `mkdir`/`rm`/`mv`/`cp`/`touch`, any
  state-changing git command, package installs, `pnpm db:*`, `docker compose`, `./scripts/dev.sh`,
  `./scripts/e2e.sh`. No `Write`, no `Edit`.

  Body sections:

  1. `# Plan verifier (read-only)` — one line: you settle a finished change against the plan it
     came from, and you wrote neither.
  2. `## You perform verification, not validation` — the line that keeps the agent from drifting,
     and it is the ISTQB distinction: *are we building the product right* (verification) vs *are
     we building the right product* (validation). **You verify against a written plan. You do not
     judge whether the plan was a good idea.** A plan you disagree with is still the standard.
  3. `## Preflight — you do not start without a plan on disk` — three checks in the shape of
     `implementer.md:28-42`: you were given a path under `docs/plans/`; the file exists and you
     read it in full; it is a plan, not an outline (it carries `Work items` with `Done means`
     lines and a `Verification plan`). Any check fails → return
     `Status: BLOCKED — no usable plan`, naming which check failed and the path you were given.
  4. `## The anti-drift mechanism` — **the core of this file.** Six parts, and the body must
     present them as this repo's own design:
     1. **Enumerate before you read code.** Extract every work-item id and its `Done means`
        **verbatim** into a list before opening a single source file. A verifier that reads the
        code first anchors on what the code does and then hunts for the item that matches — that
        is the drift, in its purest form.
     2. **One row per item, no exceptions.** The output table is keyed by item id and has exactly
        as many rows as the plan has items. An item you cannot settle is `unverifiable` **with the
        reason** — never dropped, never merged into a neighbour.
     3. **A finding not keyed to an item is not a finding.** Anything real but off-plan goes under
        `## Off-plan observations`, which carries no verdict weight. This is the explicit
        prohibition on substituting generic code review for the per-item check.
     4. **`Done means` is quoted verbatim in its row**, so a reader can see the verdict answers the
        stated criterion and not a paraphrase of it.
     5. **Evidence or `not met`.** Mirrors `implementer.md:176-180`: *"If you cannot point at the
        evidence, the item is not `done`."* Name the line that now exists, the command that now
        passes, or the behaviour observed. Do not let a passing typecheck stand in for a
        `Done means` about behaviour.
     6. **Also settle the plan's own four contract answers** (`planner.md:148-162`): vendor/shared
        lock-step, migration, seed, client build. A plan that answered "no" where the diff says
        otherwise is a finding **against the plan**, not against the code.

     The failure mode this defends against is documented: **arXiv 2603.00539** (Jin & Chen, *Are
     LLMs Reliable Code Reviewers? Systematic Overcorrection in Requirement Conformance
     Judgement*, 2026 — **unreviewed preprint**) finds that LLMs "suggest code modifications beyond
     what specifications actually require", which is exactly the drift from conformance judgement
     into generic advice. Cite it as evidence that the failure mode is real and named; the six-part
     mechanism above is this repo's design, not the paper's recommendation, and the paper's own
     proposed mitigations could not be extracted.
  5. `## Weak criteria are reported, not repaired` — Definition-of-Ready practice says to replace
     subjective language with a measurable threshold, and that a criterion which stays untestable
     should not be accepted rather than charitably interpreted. **Therefore: do not guess what a
     vague `Done means` intended.** Mark the row `unverifiable`, quote the criterion, and say what
     would make it settleable. A verifier's value rests on the plan's `Done means` being checkable
     (`planner.md:265-266`); a plan full of `unverifiable` rows is a correct result about the
     plan, not a failure of the verifier. Say that in the file so the output is not misread.
  6. `## Both directions` — a traceability check runs forward **and** backward: requirement →
     deliverable → verification evidence, and back. PMBOK (6th ed.) defines the matrix as "a grid
     that links product requirements from their origin to the deliverables that satisfy them";
     INCOSE and IEEE/ISO/IEC 29148 secondary summaries agree. So the report carries both
     `## Plan items with no corresponding change` and `## Changes with no corresponding plan item`.
  7. `## Hard constraints` — read-only Bash with the enumerated forbidden list; never edit, never
     commit; **never delete or rewrite the plan file** (`implementer.md:162`) — it is the record
     the report is read against; the decline-an-engineering-insights-capture clause.
  8. `## Output` — fenced ```markdown: verdict line
     `VERIFIED | PARTIALLY VERIFIED | NOT VERIFIED | BLOCKED — no usable plan`; the plan path; the
     per-item table (Item | `Done means` verbatim | Evidence | Verdict); the two traceability
     sections; `## Contract answers re-checked`; `## Off-plan observations`.
  9. `## Quality bar` — no row without evidence; no verdict rounded up; `unverifiable` is a real
     and useful answer; no generic review advice anywhere above `## Off-plan observations`.

  **Label honestly in the body:** the four-state verdict vocabulary (verified / partially verified
  / not verified / not testable) could not be traced to any single standards body — it is
  widespread practitioner convention. Do not attribute it to ISTQB, IEEE or INCOSE.

- **Files:** `.claude/agents/plan-verifier.md`
- **Done means:** the file exists; frontmatter carries `name`, `description`, `tools`, `model`,
  `maxTurns: 40`; `tools` has no `Write` and no `Edit`; the body contains (a) the
  verification-not-validation sentence, (b) a three-check preflight returning
  `BLOCKED — no usable plan`, (c) all six numbered anti-drift parts, (d) the explicit statement
  that an unkeyed finding is not a finding, (e) both traceability directions as named output
  sections, (f) the "do not guess a vague `Done means`" rule, (g) the note that the four-state
  vocabulary is convention and not a standard, (h) the decline-insights clause.
- **Verify:** read the file and check (a)-(h); `git status --porcelain` shows the new path.
- **Rules that apply:** unrouted. Standard is `implementer.md:22-42` for the preflight shape and
  `implementer.md:164-194` for the per-item discipline it independently re-performs.
- **Risk:** low as a file; medium as a capability. Its output quality is bounded by plan quality,
  which the file itself must say.

### W4 — write `.claude/agents/doc-writer.md`

- **Do:** create the file with this frontmatter, then the body below.

  ```yaml
  ---
  name: doc-writer
  description: "Documents implemented features: turns a plan, a diff or a module into documentation with Mermaid diagrams, and places each document in the section this repo's conventions actually assign it — a package docs/ for a topic deep-dive, a package specs/ for L0N requirements and acceptance criteria, root docs/ for a cross-cutting topic. Updates the section index where one exists. Never writes INSIGHTS.md, never writes a plan, and never writes source."
  tools: Read, Grep, Glob, Write, Edit, Bash
  model: sonnet
  skills:
    - mermaid-diagram
  ---
  ```

  `Bash` read-only, same enumerated narrowing as W3 — it is there to ask the history why something
  is the way it is, which is how a doc gets its *why*.

  Body sections:

  1. `# Doc writer` — one line.
  2. `## Hard constraints`:
     - **Never `INSIGHTS.md`.** It is append-only and written exclusively through
       `.claude/skills/engineering-insights/scripts/append-insight.mjs` — root `CLAUDE.md`:
       "never by hand and never with `Write`". It looks like a doc you should own; it is not.
       Plus the decline-an-insights-capture clause (`implementer.md:51-53`).
     - **Never `docs/plans/`.** That is `planner`'s sole artifact (`planner.md:26-30`).
     - Never source, never a migration, never a lockfile, never commit/push/PR.
     - **"Duplication is Evil... Do not write your own guide to a common... process. Link to it
       instead"** — Google's `docguide` (officially documented). This is the citable basis for
       *update the existing document rather than adding a second one*. Before creating a file,
       search `docs/`, the package `docs/`, `specs/` and the READMEs for one that already owns the
       topic.
     - **"Change your documentation in the same CL as the code change"** — same source. A doc
       landing in a later change is a doc that is already drifting.
  3. `## Where it goes` — the routing table, derived from the tree:

     | Content | Home | Naming | Index |
     |---|---|---|---|
     | Deep-dive on how one thing in one package works | `<pkg>/docs/<topic>.md` | one topic per file | that package's `docs/README.md` `## Index` |
     | Requirements + acceptance criteria for a lesson feature | `<pkg>/specs/L0N-<feature>.md` | one file per lesson feature, per package | `<pkg>/specs/README.md` |
     | A topic spanning packages | `docs/<topic>.md` | `<topic>.md` | **none exists** — see the weakness note |
     | A reviewer agent's system prompt | `docs/agent-prompts/<name>.md` | — | `README.md`, **and** push via `PUT /agents/:id` |
     | A reviewer skill body | `docs/skills/<family>/<rule>.md` | — | `README.md`, **and** mirror into `seed-skills.ts` |
     | A development plan | `docs/plans/<slug>.plan.md` | — | **forbidden — planner's territory** |
     | A session finding | `INSIGHTS.md` | — | **forbidden — script only** |

     Sources for the rows, quoted in the body: `<pkg>/docs/README.md` — *"One file per topic:
     `<topic>.md` … Add a line to this index when you add a file — keep the index itself short,
     the depth goes in the file."* `<pkg>/specs/README.md` — *"One file per lesson feature:
     `L0N-<feature>.md` … Requirements + acceptance criteria only — implementation notes belong in
     `docs/`, findings from building it belong in `INSIGHTS.md`."* That last sentence **is** the
     three-way split; it is the most load-bearing line in the table. Root `CLAUDE.md`: "`specs/` →
     `L0N-<feature>.md` · `docs/` → `<topic>.md` (one topic per file)". Worked example: `L01-run-cost`
     exists once per package (`client/specs/`, `server/specs/`, `reviewer-core/specs/`), each
     scoped to that package's half — a lesson gets one spec per package, not one shared spec.
  4. `## Two families that are not ordinary docs` — `docs/agent-prompts/README.md`: these are the
     human-readable originals of `agents.system_prompt` and *"The DB is the source of truth at run
     time"*. `docs/skills/api-contract/README.md`: same for `skills.body`, plus the seed, plus the
     warning that *"the seed never overwrites a row that exists, by design, so editing the literal
     does not heal a database that already ran it"*. **For either family, the file alone is not
     the delivery** — say so in the report every time.
  5. `## The honest weakness` — C2 in full: root `docs/` has no README, no index and no rule
     beyond `<topic>.md`, and the seven files there are four unrelated genres. The routing row for
     root `docs/` is **this repo's own synthesis from the tree**, not an inherited convention. If a
     document genuinely belongs at root `docs/`, propose `docs/README.md` as an index in the same
     change and say that the convention is being established, not followed.
  6. `## Shape, once the home is decided` — **two axes, two different questions, and one does not
     replace the other.** The repo's three-way split decides **where**. Diátaxis
     (diataxis.fr/compass) decides **how it is written**: action vs cognition, acquisition vs
     application → tutorial, how-to, reference, explanation. **The quadrants do not map onto this
     repo's split** — `specs/` holds requirements and acceptance criteria, which is no Diátaxis
     type, and `INSIGHTS.md` holds session findings, which is also none of them. So use the repo's
     split unmodified for placement and the compass only for shape. Worth quoting
     (diataxis.fr/start-here): *"Crossing or blurring the boundaries described in the map is at the
     heart of a vast number of problems in documentation."*
     One-topic-per-file is sourced to this repo's own package READMEs — Write the Docs' docs-as-code
     guide covers version control, plain text and review-like-code but does **not** prescribe it.
  7. `## Diagrams` — `mermaid-diagram` is preloaded. `mermaid@^11.15.0` is a real client dependency
     (`client/package.json:16`), so diagrams render in-app as well as on GitHub. Two confirmed
     syntax traps from mermaid.js.org: a node or label of exactly lowercase `end` breaks a
     flowchart (capitalize it), and node IDs beginning with `o` or `x` are special-cased into
     circle/cross edge syntax unless spaced or capitalized. **Label honestly:** Mermaid's docs give
     **no** guidance on which diagram type suits which purpose, and no authority was found on when
     a diagram earns its place — any selection guidance in this section is this repo's inference
     and must be marked as such.
  8. `## The index is part of the document` — adding a file without its index line half-lands the
     change. **Known inconsistency the agent will hit immediately:** `server/docs/README.md`
     instructs "Add a line to this index" but **has no `## Index` section**, while
     `client/docs/README.md` and `reviewer-core/docs/README.md` both do. Creating it is the correct
     fix, and the agent should say it did.
  9. `## Nothing reviews what you write` — `docs/**` and `**/*.md` are unrouted by design
     (`routing.json:199-210`). Every file this agent produces appears in `/pr-self-review`'s
     Coverage table under *no domain reviewer*. **State that in your report**, per `routing.md`'s
     reasoning that the gap is shown rather than hidden behind the exclusion that caused it.
  10. `## Output` — fenced ```markdown: `## Documents written` table (path | new/updated | why this
      home, citing the README rule); `## Indexes updated`; `## Not the whole delivery` (the
      mirrored-source obligations); `## Coverage` (the unrouted statement); `## Conventions
      established rather than followed` — empty or named.
  11. `## Quality bar` — link, do not duplicate; the index line is not optional; no diagram without
      a reason; say when you invented a convention.

- **Files:** `.claude/agents/doc-writer.md`
- **Done means:** the file exists; frontmatter carries `name`, `description`, `tools`, `model`,
  `skills: [mermaid-diagram]`; the body contains (a) the `INSIGHTS.md` prohibition with its
  script-only reason, (b) the `docs/plans/` prohibition, (c) the seven-row routing table with each
  row's source quoted, (d) the two mirrored-source families and their extra obligation, (e) the
  root-`docs/`-weakness section saying the convention is this repo's synthesis, (f) the
  where-vs-shape distinction with the explicit statement that Diátaxis does not map onto the
  repo's split, (g) the `server/docs/README.md` missing-index note, (h) the unrouted-coverage
  statement, (i) the decline-insights clause.
- **Verify:** read the file and check (a)-(i); `git status --porcelain` shows the new path.
- **Rules that apply:** unrouted. Standard is the house format; content standard is the package
  `docs/README.md` and `specs/README.md` files quoted above.
- **Risk:** medium. C2 means part of this agent's standard is invented. If the implementer states
  the invented part as inherited convention, the next session obeys a rule nobody agreed to.

---

## Verification plan

Nothing in any package is touched, so the usual package gates do not apply — and saying so is part
of the verification, not an omission.

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `git status --porcelain` | repo root | — | exactly four new untracked paths under `.claude/agents/`, and no other file added or modified |
| `git diff --stat` | repo root | — | empty — no tracked file was modified |
| read each of the four files | — | — | every `Done means` checklist item in W1-W4 is present |
| — | `server/` | pnpm | **not applicable:** no file under `server/` changes, so `pnpm typecheck`, `pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm arch:check` have nothing to say about this diff |
| — | `client/` | pnpm | **not applicable:** no client file changes, so `pnpm test` and `pnpm build` have nothing to say. (The `pnpm build` rule exists for a *value* import from `@devdigest/shared`; none is possible here) |
| — | `reviewer-core/`, `e2e/` | npm | **not applicable.** In particular `npm test` in `e2e/` is never run at all — it is `tsx run.ts`, a live browser runner (`e2e/package.json:8`), and even `npm run typecheck` fails there because `scripts/dev.sh:76-80` never installs e2e deps (`e2e/INSIGHTS.md`, 2026-09-18) |

**The one check that cannot be run in the session that makes the change:** `.claude/agents/*.md` is
read at session start (`pr-self-review/reviewer-prompt.md:66-73`,
`pr-self-review/SKILL.md:101-107`), so none of the four registers as a dispatchable agent type
until the next session. Acceptance is therefore two-stage: the file checks above now, and a
dispatch smoke test — one trivial task to each of the four — after a restart. **This must be stated
in the PR**, or the caller will try to dispatch `test-writer` immediately, get "no such agent
type", and conclude the file is malformed.

---

## Assumptions

1. The four frontmatter field sets above are valid. `name` and `description` are the only required
   fields; `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`,
   `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation`, `color`,
   `initialPrompt` and `experimental` are the documented optional set (Claude Code sub-agents
   docs). `Skill` is a valid entry in `tools` — the docs say that to prevent skill invocation you
   "omit `Skill` from the `tools` list or add it to `disallowedTools`".
2. `description` drives automatic delegation — the docs say Claude routes on the task description,
   the `description` field and current context, and advise writing descriptions "specific enough to
   route to the right subagent". The four descriptions above therefore use **disjoint trigger
   nouns**: *test file / suite / coverage / `.it.test.ts`* (W1) · *module / directory / ring /
   layering / boundary / scope* (W2) · *plan / work item / `Done means` / `docs/plans/`* (W3) ·
   *document / `docs/` / `specs/` / diagram / index* (W4). W2's description explicitly disclaims
   "diff" to keep it clear of `pr-reviewer`.
3. The closing negative clause ("Does not plan, and does not review architecture") is kept for
   consistency with all four existing files, but it is **this repo's house convention** — it
   appears nowhere in the official sub-agent docs and must not be presented as an externally
   sourced technique.
4. `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "2"` (`.claude/settings.json:4`) is irrelevant here:
   none of the four is granted `Agent`.
5. Stale claims the implementer will meet and must not propagate:
   - **`pnpm arch:check` IS committed.** `.claude/skills/pr-self-review/checks.md:50-54` and
     `pr-self-review/SKILL.md:80-83` both say it is not, and that
     `server/.dependency-cruiser.cjs` is untracked. Both are false: `git show HEAD:server/package.json`
     carries `arch:check` at line 11 and `git ls-files server/.dependency-cruiser.cjs` returns the
     file. `implementer.md:141-142` already records the correction. W2 must not repeat the stale
     version.
   - **The `.it.test.ts` heuristic's type-only false positive** — `server/test/jobs.test.ts` has
     `import type { Db }`, a type-only import used to type a mock; a naive "imports something
     DB-ish" rule flagged it (`pr-self-review/README.md:72-76`). W1 carries the correction.
   - **`server/docs/README.md` has no `## Index`** despite instructing that one be maintained,
     while `client/docs/README.md` and `reviewer-core/docs/README.md` both have one. W4 names it.
   - **`TESTING.md:83-86` says `server/package.json` is `skip-worktree`;** `git ls-files -v`
     returns `H` for it on this checkout, i.e. it is not. The consequence still holds either way —
     there is no `test:unit`/`test:integration` script in `server/package.json:6-17`, only
     `test: vitest run` — so W1 must write the explicit `pnpm exec vitest run …` split forms.
   - **`baseline.json.known_failing_tests` is now `[]`** and its `_history` records the six
     `indexer-pipeline` failures as fixed (verified 118 tests / 20 files green,
     `server/INSIGHTS.md` Tool & Library, 2026-09-18), while `server/INSIGHTS.md`'s own 2026-09-16
     entry still says they fail. The later entry wins.
6. Creating `docs/plans/` is a side effect of writing this plan file, not a work item. The
   directory did not exist before (`ls docs/plans` → *No such file or directory*).

---

## Open questions

Carried forward verbatim as `Not established`. None blocks W1-W4; each is handled defensively in
the file it affects.

1. **Do a parent session's `UserPromptSubmit` / `Stop` hooks fire for a subagent turn?** Not
   established. What is documented is that `hooks` is itself a valid subagent frontmatter field,
   which implies per-agent hook config exists but says nothing about inheritance.
   `.claude/hooks/insights-stop.mjs` keys its one-block-per-session marker on `payload.session_id`.
   **Handled defensively:** all four files carry an explicit clause declining any instruction to
   run an engineering-insights capture, citing `implementer.md:51-53`.
2. **Guidance on agent-body length.** Not established — no official guidance found. Judged against
   the house files (`planner.md` is 273 lines, `pr-reviewer.md` is 121).
3. **Primary text of IEEE/ISO/IEC 29148 and the ISTQB glossary/syllabus.** Not readable — 29148 is
   paywalled and was worked from secondary summaries; the ISTQB pages were JS-rendered /
   unparseable. The both-directions traceability claim in W3 is therefore **medium-low
   confidence**, corroborated by PMBOK 6th ed. and INCOSE summaries. The four-state verdict
   vocabulary could not be traced to any standards body at all and is labelled convention.
4. **arXiv 2603.00539's proposed mitigations.** Not extractable. W3's six-part mechanism is this
   repo's own design; the paper is cited only as evidence that the failure mode is real and named,
   and it is an unreviewed preprint.
5. **Mermaid rendering inside this client's `react-markdown` + `mermaid@^11` stack.** Not
   researched. W4's diagrams are written to standard Mermaid syntax with the two confirmed traps
   avoided; whether every diagram type renders in-app is untested.
6. **There is no authoritative "test-writer refusal list" anywhere.** The refusal list in W1 — what
   `test-writer` declines to attempt — is this repo's own synthesis and the file must say so rather
   than implying an external standard.
7. **Whether `implementer.md` should gain a matching prohibition on weakening tests** (D2's
   residual risk). Only the caller can decide; this plan writes one file and it is not that one.
8. **Failing-assertion-first for LLM-generated tests.** Nothing establishes that it improves
   quality specifically for generated tests; the TDD evidence base (Rafique & Mišić meta-analysis,
   IEEE TSE 2013 — small positive quality effect, no productivity effect) is about humans. W1
   presents the derive-the-failing-case-first workflow as **practitioner recommendation** (Anthropic
   best-practices page), not as evidence.

---

## Research used

Three tiers, kept separate on purpose. Anything below labelled *repo synthesis* has no external
source and must be presented that way in the agent files.

**Tier 1 — officially documented**

| Question | Conclusion relied on | Source |
|---|---|---|
| Are `skills:` / `maxTurns` real fields? | Yes. `name` + `description` required; the optional set is `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation`, `color`, `initialPrompt`, `experimental` | code.claude.com/docs/en/sub-agents |
| Does `skills:` restrict access? | No — it controls **preloading**. To prevent invocation, omit `Skill` from `tools` or list it in `disallowedTools`. This is the mechanism that enforces W2/W3's read-by-path | same |
| Does `description` drive delegation? | Yes — routing uses the task description, the `description` field and context; write descriptions specific enough to single out one subagent | same |
| Test-authoring workflow | Derive the failing case from the symptom/requirement first; keep test author and code author in separate contexts — "the agent doing the work isn't the one grading it" | code.claude.com/docs/en/best-practices |
| `fireEvent` vs `user-event` | `fireEvent` dispatches DOM events; `user-event` simulates full interactions incl. interactability checks; the fallback "relies on assumptions about the concrete aspects of the interaction being correct" | testing-library.com/docs/user-event/intro |
| RTL query priority; `waitFor` | Priority unchanged; prefer `findBy*`; **`waitFor`'s callback must throw to retry** — a falsy return does not (1000ms/50ms defaults) | testing-library.com |
| Same-file mocking | A call from one exported function to another **in the same file** cannot be intercepted by `vi.mock`/`vi.spyOn`; "intended behavior", use dependency injection | vitest.dev/guide/mocking/modules |
| Shared-resource test lanes | `fileParallelism: false` is the documented lever | vitest.dev/guide/parallelism |
| Fastify route tests | `app.inject()` is the recommended default — boots all plugins, no listening socket | fastify.dev/docs/v5.1.x/Guides/Testing |
| dependency-cruiser delta | **First-party baseline exists:** `--baseline [file]` snapshots to `.dependency-cruiser-known-violations.json`, `--ignore-known` suppresses; re-running reports new/same/stale. Outputs: `json`, `err`, `err-long` (includes the rule's own comment), `err-html`, `csv`, `metrics`. **Exit code = count of ERROR-severity violations only** — which is exactly why our 20 warnings exit 0 | dependency-cruiser doc/cli.md |
| Next.js client boundary | `'use client'` marks a **module-graph** boundary; data crosses as serializable props only; a Server Component passed as `children` renders server-side and its **output** crosses; named anti-pattern **"environment poisoning"**, with `server-only`/`client-only` as build-time enforcement; put the directive on the smallest interactive leaf | nextjs.org, docs 16.3.5, fetched 2026-09-22 |
| Review comment quality | Explain **why**, not restate **what**; understand the code before commenting; prefix non-blocking points `Nit:` | Google eng-practices, `review/reviewer/looking-for.md` |
| Documentation | "Duplication is Evil… Do not write your own guide… Link to it instead"; "Change your documentation in the same CL as the code change" | Google `docguide` |
| Doc shape | Two axes (action/cognition × acquisition/application) → tutorial, how-to, reference, explanation. "Crossing or blurring the boundaries… is at the heart of a vast number of problems in documentation" | diataxis.fr/compass, /start-here |
| Mermaid syntax traps | A node/label of exactly lowercase `end` breaks a flowchart; node IDs starting `o`/`x` are special-cased unless spaced or capitalized | mermaid.js.org |
| ADR formats | Nygard 2011 (Title/Context/Decision/Status/Consequences) and MADR are both fully specified | respective docs |

**Tier 2 — peer-reviewed or preprint research** (each labelled with its status)

| Claim | Status | Source |
|---|---|---|
| Agents under "make it pass" pressure game tests — modify the test file, hardcode outputs, overload operators, track state; GPT-5 exploited 76% on one variant **even under explicit instruction not to**; removing write access to test files worked, read-only test access was the best cost/safety tradeoff | **preprint, not peer-reviewed** | arXiv 2510.20270 (Zhong, Raghunathan, Carlini), 2025-10-30 |
| **Over-mocking** defined as tests that mock the unit under test itself or mock excessive dependencies, "preventing validation of actual implementation behavior" — cite the definition only; no rate was extractable | conference paper | Hora & Robbes, MSR'26, Apr 2026 |
| Assertion Roulette and Magic Number Test recur in LLM-generated suites, tied to prompting strategy and context length (20,505 generated suites vs 779,585 human tests) | accepted TOSEM 2026 | arXiv 2410.10628 |
| Mutation-guided generation as the quality signal; 73% of generated tests accepted by engineers | peer-reviewed, industry track | arXiv 2501.12862 (Meta ACH), FSE'25 |
| LLM reviewers "suggest code modifications beyond what specifications actually require" — systematic overcorrection in requirement-conformance judgement. Cited **only** as evidence the failure mode is real; its mitigations could not be extracted | **unreviewed preprint** | arXiv 2603.00539 (Jin & Chen), 2026 |
| TDD's effect is a small positive on quality, none on productivity — **about humans**, not generated tests | meta-analysis | Rafique & Mišić, IEEE TSE 2013 |
| Traceability runs in both directions; "a grid that links product requirements from their origin to the deliverables that satisfy them" | standard; **29148 primary text paywalled**, worked from secondary summaries | PMBOK 6th ed.; INCOSE / IEEE-ISO-IEC 29148 summaries |
| Verification ("are we building the product right") vs validation ("are we building the right product") | **ISTQB pages not directly readable** — JS-rendered / unparseable PDF | ISTQB, via secondary summaries |
| Freeze-the-debt as an established pattern | corroborating | ArchUnit `FreezingArchRule`; SonarQube "Clean as You Code" new-code-period |

**Tier 3 — weak / vendor / self-reported. Use as corroboration, never as a number to rely on.**

- cubic (2025): a **self-reported, unreplicated** vendor case study attributing a 51% false-positive
  reduction to forcing structured reasoning + finding + confidence fields before any comment, and to
  narrowing the tool surface. Corroborates W2's output contract; the number is not load-bearing.
- Meta's engineering blog (2025-09-30) frames mutation testing as checking behaviour "beyond
  traditional structural coverage criteria". **It does not state a policy of discarding
  coverage-only tests**, and a "277 tests discarded" figure seen in a search snippet could not be
  reproduced from the primary paper — **do not cite that number anywhere.**

**Repo synthesis — no external source, must be labelled as such in the agent file**

- W1's refusal list (what `test-writer` declines to attempt). No authoritative list exists.
- W4's diagram-selection guidance. Mermaid's docs give no guidance on which type suits which
  purpose, and no authority was found on when a diagram earns its place.
- W3's four-state verdict vocabulary. Widespread practitioner convention; traceable to no standards
  body.
- The closing negative clause in every `description`. This repo's house convention, not a
  documented technique.
- W4's routing row for root `docs/` (C2).

**Two findings deliberately left unscoped** — recorded so they are not lost, and explicitly **not**
work items in this plan:

1. **dependency-cruiser ships the delta natively.** `--baseline` / `--ignore-known` do mechanically
   what `enforcement.md:47-60`'s hand-maintained count table does by hand — and that table rots by
   hand, which `onion-architecture/SKILL.md` §5 already half-concedes when it says a second copy
   "would only drift". W2 stays Bash-less on purpose (it is a judgement reviewer, not a check
   runner, following `pr-reviewer`'s precedent), so it cannot use this. **Recommendation for
   whoever next touches `arch:check`, not for this change.**
2. **`server-only` is a build-time enforcement this client does not use.** It is the documented
   mechanism against environment poisoning. Same handling: noted, not scoped.

---

## Rollback / blast radius

**Blast radius is as small as this repo allows.** Four new untracked files, no tracked file
modified, no package source, no schema, no seed, no contract, no lockfile. Nothing imports them;
nothing fails if they are absent.

**Revert is `git rm` on four paths** (or deleting them, since they are untracked until committed).
Nothing survives the revert: no migration, no seeded row, no `.next` artifact, no cache entry.

The only non-file consequence is **behavioural and deferred**: once these register at the next
session start, `description`-driven automatic delegation may route a task to one of the four that
previously went to `general-purpose` or to the main session. That is the intent, and it is the
reason Assumption 2's disjoint trigger nouns matter. If routing turns out to collide with
`pr-reviewer`, the fix is to tighten a `description` — a one-line edit to one of these four files,
not a revert.

One thing that cannot be undone by reverting files: nothing. There is no state outside the working
tree.
