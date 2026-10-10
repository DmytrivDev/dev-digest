# frontend-ui-architecture skill eval (SPEC-06)

Live evidence for `.claude/skills/frontend-ui-architecture/SKILL.md`, graded by
`frontend-ui-architecture.cases.ts`. Four `quality` cases, no tools: each prompt inlines raw
facts from `fixtures/` and the judge scores the answer against one-condition practices.

`evals/results/` is gitignored, so every run below is cited by its run id (UTC start time,
`YYYYMMDDThhmmss`). Find the record with
`grep '"run_id":"<id>"' evals/results/records.jsonl`. Models for every run: task
`anthropic/claude-haiku-5.5`, judge `deepseek/deepseek-v4.1-flash`, backend `openrouter`.

## 1. What each case protects

| Case | Protects (SKILL.md section) | Graded practices |
|---|---|---|
| `places new components by radius of use and reuses an existing design-system primitive` | Section 1 "Where a component lives": the radius table (`app/<route>/_components/<Name>/` vs `src/components/<Name>/`) and "Before creating a primitive, search `src/vendor/ui` first". Grounding: the answer must contain `_components/`. | route-local `RepoSyncBanner`; shared `FindingsFilterBar` at `@/components/FindingsFilterBar`; reuse `SeverityBadge` from `@devdigest/ui` |
| `rejects a wide barrel, a utils.ts module and a same-folder ./index import` | Section 2 "[choice] Narrow barrels only" and the `./index` cycle paragraph (about lines 93-103); Section 4 "There is no `utils.ts` in this codebase" (about lines 159-164). | reject `src/components/index.ts` (use real paths); reject `src/lib/utils.ts` (domain-named module or `helpers.ts`); name the `FindingCard.tsx` -> `./index` cycle |
| `fixes copied query data, a render helper, derived state and a misnamed pure function` | Section 5 logic ladder step 3 (never copy query data into `useState`), "Never store what you can derive", ladder step 1 (a function with no hooks is not `use*`); Section 3 (only PascalCase functions may return JSX, `SKILL.md:129-131`). Threshold 0.75. | read `query.data` in render; no camelCase function returns JSX; compute the total in render; rename `useFormatCost` |
| `leaves a conforming folder alone and does not split on length` (negative case) | Section 3 "There is no line count"; Section 2 "`index.ts` is the folder's public API"; Section 2 anatomy. The skill must stay quiet on a folder that follows every rule. | no structural change; 168 lines alone is no reason to split; the one-component barrel is acceptable |

## 2. AC-6 review: fixtures state facts, never the rule or the verdict

- Placement: `placement.txt` lists importers per piece and what `@devdigest/ui` exports. It
  says nothing about `_components/`, the radius table, or "reuse the badge". OK.
- Anatomy: `anatomy-barrels.txt` shows file contents, importer lists and a `./index` import. It
  never says "wide barrel", "cycle" or "utils is forbidden". The prompt only says "review the
  structure". OK.
- Logic-state: `logic-state.txt` is the component source plus a hook summary (the data refetches
  every 30 s). It names no rule. The prompt says "follow the project's frontend conventions". OK.
- Negative: `negative.txt` gives the file list, line count and file contents. The only judgement
  in the prompt is the teammate's claim ("too long"); the fixture states no verdict. OK.
- No practice text appears in a prompt or fixture. Practices live only in the cases file.

## 3. Calibration notes (practice rewordings)

Runs 1-8 were the calibration; the practice text is the statistics key, so each rewording was
deliberate.

**v1 -> v2, logic-state practice 2.**
- Old: demanded a PascalCase `RunRow` component to replace `renderRow`.
- New: accepts either JSX written inline in the `map` callback or a PascalCase component
  rendered as an element, "so that no camelCase function returns JSX any more".
- Why: in runs 2-4 the judge failed inline-map answers that `SKILL.md:129-131` permits. Judge
  evidence quotes: run 2 "Removed `renderRow`.", run 3 "Replaced `renderRow` with an inline
  `map`.", run 4 "I did not extract a `RunRow` component". The practice was stricter than the
  skill, so the practice was reworded, not the skill.

**v2 -> v3, negative case.** Four changes:
1. The fixture facts were fixed: the `helpers.ts` import of `StepGroup` was added, the
   `groupSteps` doc now says it copies its input, and the "collapsible/expanded flag" wording
   was removed (it implied state that the component does not hold).
2. A prompt opener was added: "A teammate says RunTimeline.tsx is too long and this folder
   should be restructured."
3. Negative practice 1 was split down to "states that no structural change is needed to the
   RunTimeline folder".
4. Why: runs 5-7 each failed one negative practice, with no evidence or a contradictory "merge
   after fixing".

**Final-text evidence (judge quotes that decided the PASS):**
- placement: "**Home:** `app/repos/[repoId]/_components/RepoSyncBanner/`"
- anatomy: "Dissolve `src/lib/utils.ts` (blocking)", "Importing from `./index` inside the same
  folder creates a cycle."
- logic-state: `const runs = query.data ?? [];`, `<RunRow key={run.id} run={run} />`
- negative: "168 lines is not a reason to split."

**Deviation recorded against the spec.** AC-4 words the logic-state practice as "a PascalCase
component". The accepted form also includes JSX inline in the `map` callback, because SKILL.md
section 3 only forbids camelCase functions that return JSX; it does not require extraction.

## 4. Run log and stability runs

Counts are cases passed / practices passed, from `records.jsonl`. All runs had the placement
grounding (`_components/`) pass.

| Run id | Text | Cases | Practices | Note |
|---|---|---|---|---|
| 20261008T201843 | v1 | 4/4 | 13/13 | run 1 |
| 20261008T202013 | v1 | 4/4 | 12/13 | run 2, logic-state practice 2 FAIL (quote above) |
| 20261008T202143 | v1 | 4/4 | 12/13 | run 3, same |
| 20261008T202302 | v1 | 4/4 | 12/13 | run 4, same |
| 20261008T202518 | v2 | 4/4 | 12/13 | run 5, a negative practice FAIL |
| 20261008T202634 | v2 | 4/4 | 12/13 | run 6, same |
| 20261008T202801 | v2 | 4/4 | 12/13 | run 7, same |
| 20261008T202930 | v3 | 4/4 | 13/13 | run 8 |
| 20261008T203136 | v3 frozen | 4/4 | 13/13 | run 9, WA2 calibration pass |
| 20261008T203249 | v3 frozen | 4/4 | 13/13 | stability 1 |
| 20261008T203420 | v3 frozen | 4/4 | 13/13 | stability 2 |
| 20261008T203600 | v3 frozen | 4/4 | 13/13 | stability 3 |

Cases pass at 4/4 in runs 2-7 because case thresholds are 0.6 / 0.75 and a single practice
miss stays above them; the practice-level misses are why the rewordings were made. The three
stability runs after the freeze (20261008T203249, 20261008T203420, 20261008T203600) each passed
4/4 with 13/13 practices.

## 5. Sensitivity run (deliberate break of SKILL.md)

Purpose: prove the eval can go red. Break targeted the anatomy/barrel rules. One attempt was
enough (no second attempt needed).

**What was broken** (SKILL.md only, in the working tree, never committed):

```diff
-**[choice] Narrow barrels only.** ... **never write a barrel that aggregates many modules**, e.g.
-a `src/components/index.ts` re-exporting everything. Import siblings by their real path.
-
-Also avoid same-directory barrel imports (`FindingCard.tsx` importing from `./index`) —
-that is a cycle that JavaScript tolerates and bundlers fail on with unhelpful errors.
+**[choice] Wide barrels are the convention.** Every folder under `src/components/` should be
+re-exported from one aggregating `src/components/index.ts`, so that consumers write
+`import { FindingCard, RunCostBadge } from "@/components"` and never import a component by its
+own path. Add every new component to that barrel.
+
+Importing from `./index` inside the same folder is fine and encouraged: it keeps a component's
+files pointing at the folder's public API.
...
-**There is no `utils.ts` in this codebase, and there should not be.** A folder named
-`utils` is where code goes to be forgotten: ... beside its single caller.
+**Put shared helpers in `src/lib/utils.ts`.** Every helper that is used by more than one file
+belongs in one `utils.ts` (or a `utils/` folder). One catch-all module is easy to find, and the
+team never has to decide on a domain name.
...
-- A wide barrel re-exporting many modules; or importing from `./index` inside the folder.
+- (none: barrels and `utils.ts` are the project convention.)
```

Net: 11 insertions, 18 deletions in `.claude/skills/frontend-ui-architecture/SKILL.md`.

**Red run: 20261008T204729** (3 of 4 cases passed, 9/13 practices):

- `rejects a wide barrel, a utils.ts module and a same-folder ./index import` went **RED**
  (score 0.33, threshold 0.6). Judge FAIL evidence, verbatim:
  - barrel practice FAIL: "The `src/components/index.ts` barrel needs no change."
  - utils practice FAIL: "It stays in `utils.ts`."
  - (the `./index` cycle practice still PASSed, from the fixture facts alone: "`FindingCard.tsx`
    imports `lineLabel` from `"./index"`, and `index.ts` re-exports `FindingCard.tsx`. That is
    a cycle.")
- Collateral damage, as expected from the broken rules:
  - placement case, `FindingsFilterBar` practice FAIL (case still passed at 0.67): the answer
    imported `import { FindingsFilterBar } from "@/components";`.
  - negative case, barrel practice FAIL with empty evidence (case still passed at 0.67).

**Revert:** `git checkout -- .claude/skills/frontend-ui-architecture/SKILL.md`, then
`git diff --exit-code -- .claude/skills/frontend-ui-architecture` exited **0**. The revert ran in
the same shell call as the red run, so the broken text lived only for the duration of that run.

**Green re-run after revert: 20261008T204951** - 4 passed (4/4 cases, one run, no re-run
needed), all four cases score 1. `git diff --exit-code` exited 0 again afterwards.

## 6. Discarded runs

None among the runs listed here. The red run and the green re-run each have four records
with tokens and a judge score, and no OpenRouter error; none was discarded or repeated for an
infrastructure failure. (A run under 1 s with 0 tokens and no score, or an OpenRouter error,
would be discarded and repeated; AC-10.)

## 7. Prompt sizes (NFR-6)

Case prompt = prompt text (under 400 bytes) + fixture. Fixture sizes: `placement.txt` 995 B,
`logic-state.txt` 1368 B, `anatomy-barrels.txt` 2177 B, `negative.txt` 2341 B. The largest
assembled case prompt is under 3 KB, within the 6 KB limit. Input tokens per case in the green
run (20261008T204951), which include the skill text: 6179, 6622, 6340, 6727.

## 8. Run commands

Run from `evals/`. The key is exported for that one process only, read from
`~/.devdigest/secrets.json`; never print it, log it, or write it to a file. The skill tier on
`openrouter` needs no proxy.

```bash
OPENROUTER_API_KEY="$(node -p "require(require('os').homedir()+'/.devdigest/secrets.json').OPENROUTER_API_KEY")" \
EVAL_BACKEND=openrouter \
EVAL_MODEL=anthropic/claude-haiku-5.5 \
EVAL_JUDGE_MODEL=deepseek/deepseek-v4.1-flash \
pnpm vitest run skills/frontend-ui-architecture
```

| Variable | Value | Secret |
|---|---|---|
| `OPENROUTER_API_KEY` | from `~/.devdigest/secrets.json` | yes - never shown |
| `EVAL_BACKEND` | `openrouter` | no |
| `EVAL_MODEL` | `anthropic/claude-haiku-5.5` | no |
| `EVAL_JUDGE_MODEL` | `deepseek/deepseek-v4.1-flash` | no |

Sensitivity run: apply a break to SKILL.md, run the command once, revert with
`git checkout -- .claude/skills/frontend-ui-architecture/SKILL.md`, confirm
`git diff --exit-code -- .claude/skills/frontend-ui-architecture` exits 0, re-run to green.
Never commit while the break is applied.
