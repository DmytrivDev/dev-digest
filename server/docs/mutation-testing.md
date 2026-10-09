# Mutation testing — `scoring.ts`

Stryker checks the checker: it mutates `src/modules/eval/helpers/scoring.ts`
(flips operators, drops calls, swaps literals) and re-runs
`test/eval-scoring.test.ts` per mutant. A mutant the tests do not fail on is a
behaviour the suite does not pin. Line coverage cannot see that — every line of
`scoring.ts` was already executed by the suite when the baseline below was taken.

On demand only. It is not part of `verify.mjs`, `verify:l06` or any workflow
(SPEC-06 NFR-8); a run takes about 20 s.

## Run

```bash
cd server && pnpm mutation:scoring
```

- Config: `stryker.config.json` (mutates only `src/modules/eval/helpers/scoring.ts`,
  `coverageAnalysis: perTest`, reporters clear-text + html + progress).
- Test runner config: `stryker.vitest.config.ts` — a copy of `vitest.config.ts`
  whose `include` is only `test/eval-scoring.test.ts`.
- Report: `server/reports/mutation/mutation.html`. Sandbox: `server/.stryker-tmp/`.
  Both are gitignored; a run leaves `git status` unchanged.
- Versions: `@stryker-mutator/core` 10.0.0, `@stryker-mutator/vitest-runner` 10.0.0
  (peer `vitest >=2.0.0`; installed vitest 2.1.9).

Two config lines exist because of pnpm, not taste:

- `"plugins": ["@stryker-mutator/vitest-runner"]` — Stryker's default plugin glob
  looks next to `core`'s real path inside `node_modules/.pnpm/`, where pnpm's strict
  layout does not put the runner. Without it the run dies with
  `Cannot find TestRunner plugin "vitest"`.
- `"ignorePatterns": ["clones", "reports", ".stryker-tmp"]` — keeps the sandbox copy
  off `server/clones/` (imported repos, ~1.7k files in a dev checkout).

## Results

| | Mutants | Killed | Timeout | Survived | No coverage | Score |
|---|---|---|---|---|---|---|
| Baseline (21 tests) | 118 | 114 | 0 | 4 | 0 | 96.61 % |
| After (25 tests) | 118 | 118 | 0 | 0 | 0 | 100.00 % |

A no-coverage mutant counts as a survivor; a timeout counts as detected.

## Survivors

Baseline survivors: 4, all non-equivalent. Each got one focused test in
`test/eval-scoring.test.ts` (the test name starts `kills <Mutator> @ scoring.ts:<line>`).
There are no equivalent mutants.

| Mutator | Line | Original → mutated | Classification | Killing test / reason |
|---|---|---|---|---|
| MethodExpression | 122:17 | `outcomes.map(...).filter((c) => c !== null)` → `outcomes.map(...)` | non-equivalent | `kills MethodExpression @ scoring.ts:122 — a run of only errored, cost-less cases has null cost, not 0`. With no scored case and every cost `null`, the original has `costs.length === 0` and returns `null`; the mutant keeps the `null`s, passes the length check and sums them to `0`. |
| ConditionalExpression | 122:76 | `(c): c is number => c !== null` → `=> true` | non-equivalent | `kills ConditionalExpression @ scoring.ts:122 — null costs are dropped before the "no cost at all" check`. Same observable difference as the row above (the filter keeps everything), checked with two errored cases. |
| EqualityOperator | 128:40 | `o.pass === true` → `o.pass !== true` | non-equivalent | `kills EqualityOperator @ scoring.ts:128 — cases_passed counts the passed cases, not the failed ones`. The old "counts passed" test had one pass and one fail, so counting either gave 1; two passes and one fail give 2 vs 1. |
| BooleanLiteral | 128:51 | `o.pass === true` → `o.pass === false` | non-equivalent | `kills BooleanLiteral @ scoring.ts:128 — cases_passed is 0 when every scored case failed`. All-failed input: original 0, mutant 2. |

None of the four reveals a defect in `scoring.ts`; the production file is unchanged.
The gap was in the tests' data (a symmetric 1-pass/1-fail case; no all-errored-without-cost case).

## Not in scope

No score threshold, no CI job, no other module. Add a new target by copying the two
config files and a script line, not by widening `mutate` here.
