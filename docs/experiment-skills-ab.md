# Controlled experiment — do skills change what a review finds?

Two A/B runs against real pull requests in this fork, same agent and same PR
each time, the only variable being whether skills were linked. Criteria 17 and
18. Every run is recorded in the database; the run ids below open the trace in
the studio.

The deliberate PRs exist so the answer is checkable rather than anecdotal, and
they are **not merged**:

- [#3 — `refactor(api): tidy the pull-request list payload`](https://github.com/DmytrivDev/dev-digest/pull/3)
  renames the wire field `cost_usd` to `cost` and wraps `GET /repos/:id/pulls`
  in `{ pulls: [...] }`. The diff is internally consistent — contract, route,
  hook and component all move together, `tsc` is clean and the suites pass — so
  nothing mechanical objects. Only a reader who knows that a wire field is a
  published contract sees the break.
- [#4 — `feat(pulls): show how old a pull request is in the list`](https://github.com/DmytrivDev/dev-digest/pull/4)
  adds `prAgeLabel`, six branches, with a test that covers exactly one of them.

## 18 — API Contract Reviewer on PR #3

Agent `API Contract Reviewer`, `deepseek/deepseek-v4-flash`. Its prompt carries
the role, the evidence discipline and the severity ladder, and **no contract
rules at all** — that is what makes the control run meaningful.

| | Without skills (`1401ddb7`) | With 4 skills (`1da9f1f4`) |
|---|---|---|
| Skills block | absent — no `skills` key in `token_counts` | **3161 tokens** |
| `skills_used` | `[]` | breaking-change 839 · response-schema 800 · semver-discipline 703 · deprecation-policy 819 |
| Score | 97 | **30** |
| Verdict | `comment` | `request_changes` |
| Findings | 1 × SUGGESTION — a type not re-exported from a barrel | **2 × CRITICAL** |
| Cost | $0.00018 | $0.00026 |

Without the skills the summary reads the diff as a tidy refactor: the server,
contract, hook and component are *"all updated consistently"*. With them, both
breaks are named with the line that causes them:

> **CRITICAL** — Silent breaking change: response field `cost_usd` renamed to
> `cost` — `server/src/vendor/shared/contracts/platform.ts:175`
> …any consumer that reads `pr.cost_usd` now gets `undefined`. The
> `breaking-change` rule requires that a removed field be emitted under both
> names for at least one release. The `deprecation-policy` rule requires three
> pieces of evidence for a legitimate removal: a `@deprecated` marker (absent),
> the replacement already in place (absent), a version bump (absent).

> **CRITICAL** — `GET /repos/:id/pulls` response shape changed from `PrMeta[]`
> to `{ pulls: PrMeta[] }` — `server/src/modules/pulls/routes.ts`

Both findings passed grounding (`2/2`), and the model cites which supplied rule
it is applying — the skills are being used as rules, not as atmosphere.

**One honest caveat.** The first run with skills (`95ffd57d`) returned an
*empty* findings array with a correct prose summary and the incoherent pair
`score: 100` + `request_changes`. The cheap model did the analysis and failed to
fill the structure. The re-run produced the table above. Budget one spare run
when demonstrating this live.

## 17 — Test quality on PR #4

The seeded `Test Quality Reviewer` **cannot** prove this criterion, and that is
worth stating rather than hiding: its own system prompt already says *"a branch
that no test enters is the single most common defect in a test PR"*, so it flags
uncovered branches with nothing attached. Run `66ff6b08` (no skills) reported
five WARNINGs on its own; the rubric only sharpened the result (`48ea2044`:
score 40 → 17, `comment` → `request_changes`, the null branch raised to
CRITICAL, boundary values 0/1/6/7/29/30 named).

To isolate the skill, `Test Quality Reviewer (experiment)` carries the same
structure with **no test-quality rules** — the same shape as the API Contract
agent's prompt.

| | Without the rubric (`a7b7ad4b`) | With `test-quality-rubric` (`d7399bfc`) |
|---|---|---|
| Skills block | absent | **501 tokens** (v3) |
| Score | 100 | 88 |
| Verdict | `approve` | `comment` |
| Findings | **0** | 1 × WARNING — *"covers only one of six branches"* |

The control did not overlook the test — its summary says *"The test correctly
checks that a PR opened exactly 3 days ago is labelled '3 days'"* and approves.
With the rubric the same model names every uncovered branch: null input, today,
yesterday, 4–6 days, weeks, stale.

## What the two experiments actually show

A skill is not decoration in the UI: its body is inserted into the prompt, the
trace prices that block on its own, and removing it measurably changes the
verdict. The second experiment adds the constraint that makes the first one
honest — **an agent whose prompt already contains the rules cannot demonstrate
anything about skills**, because the control run is not a control.
