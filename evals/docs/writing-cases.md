# Writing eval cases

How to write cases that measure something. Read this before adding or editing any
`*.cases.ts`. Every rule below is tied to how the engine actually runs (`src/`), to a failure
seen in `results/records.jsonl`, or to an external source listed at the end.

> One-line version: **a case tests what the artifact adds over the raw model, with inputs the
> model must reason over, and expectations a blind checker can verify from the output alone.**

## 1. What happens to a case

| | Skill (`skillTask`) | Agent (`agentTask`) | Workflow (`workflowTask`) |
|---|---|---|---|
| System prompt | `SKILL.md` (frontmatter kept) + every `references/*.md` | agent body, frontmatter stripped | none injected — real `CLAUDE.md`, skills and agents load from disk |
| Tools | **none**; a "you have NO tools" directive is appended | the agent's frontmatter `tools:` minus Write/Edit/Bash/NotebookEdit | read-only: Read, Grep, Glob, Task, Agent, Skill |
| Working dir | — | the real repo | the real repo |
| Model | `EVAL_MODEL` (frontmatter `model:` is ignored) | same | same |
| Checked by | grounding gate → LLM judge | grounding gate → LLM judge | code, against the session trace — no judge |
| Baseline (`EVAL_CONFIG=baseline`) | same prompt, no `SKILL.md` (the NO-tools directive stays) | same prompt, same tools, no definition | ignored — use `contrast` for a control |
| Evidence | `src/tasks.ts`, `src/artifacts/load.ts`, `src/runtime/run-claude.ts` | same | `src/dsl/case.ts` (`runWorkflowCases`) |

**The judge is blind.** It receives the rubric, your numbered practices and the model's output
— never the prompt, the fixture or the skill (`src/scoring/llm-judge.ts`). It returns PASS only
with a verbatim quote from the output. `score = passed / practices the judge returned`, and the
case passes when `score >= threshold` (default 0.6).

**Order for skill/agent cases:** grounding substrings first (case-insensitive, ALL must match);
if any is missing the judge is skipped, the record has `practices: []` and no score, and the
test fails. The record is written before the asserts, so failed runs are always recorded.

`kind: "quality" | "grounding"` on a skill/agent case is declared but not read by the runner: a
case with `grounding` is gated, and if it also has `practices` the judge runs after the gate.

## 2. How to write cases for an artifact

1. **Read the artifact** (`SKILL.md` or the agent `.md`) and list its rules: every *always*,
   *never*, *must*, every step and every output format it mandates.
2. **Strike what a raw model already does.** Generic competence ("names the unused package")
   gets at most one practice. The weight goes on rules the model would not follow unaided.
3. **For each kept rule, design a situation where breaking it is tempting.** "Size alone is
   never P0" is tested with a 300 MB framework in the data; "do not invent a P0" with data that
   reports `P0: 0`.
4. **Build the input from raw facts, not conclusions.** Give the import list, not "moment is
   unused". The model must reach the finding itself.
5. **Write each expectation as one binary, quotable condition** (section 3).
6. **Add at least one negative case**: input where the artifact must stay quiet or refuse
   (benign diff, near-miss prompt, `P0: 0`).
7. **Run and clean up** (section 7): `eval:benchmark ... -n 5`, then rewrite or drop
   `non_discriminating` practices and investigate `always_failing` ones.

Size: **2–4 cases per artifact, 3–6 practices per case.** Start from 2–3 realistic prompts,
then write the expectations (skill-creator does the same).

## 3. Rules for every case

### Prompt and fixture
- **Never put the answer in the prompt.** If the prompt says "isn't a monorepo, packages share
  code via path aliases", the baseline repeats it and the practice stops discriminating
  (observed: baseline 100% on "distinguishes internal vs external dependencies").
- **Fixtures must be true and agree with the practices.** A fixture line "three different zod
  versions" next to a practice expecting two versions failed every correct answer.
- **Never hide the fixture from baseline.** Candidate and baseline differ only by the artifact;
  change two variables and the delta means nothing (README, `eval:benchmark`).
- **Every requirement you grade must be reachable from the prompt.** No hidden requirements:
  the model cannot be graded on a format nobody asked for unless the artifact mandates it.
- **Keep fixtures small and realistic** — a 20-line diff beats a 2000-line one: cheaper and
  less noise.

### Practices (skill/agent)
- **Self-contained.** The judge never sees the prompt, so spell out the expected value: write
  "names TWO zod versions: 3.22.4 in client, 3.23.8 in server and reviewer-core", not
  "counts the versions in the data correctly".
- **One condition per practice.** "Uses P0/P1/P2 headings AND puts no large item in P0" failed
  4/4 runs on the first half while the second half was correct.
- **Positive and quotable.** The judge needs a quote. "Does not claim X" has nothing to quote,
  so the judge picks a random line as evidence (observed: "does not say workspace" failed on
  the word "monorepo" and on `pnpm remove moment`). Prefer "states that the packages are
  independent installs". If a negative is unavoidable, name the exact forbidden statement.
- **Never "everything matches the data".** The blind judge cannot see the data; it failed
  answers quoting "29.7 MB", which was in the data. Instead list the forbidden kinds of
  content ("adds no savings estimate, no CI size limit, no 'bundle size' figure").
- **Grade the outcome, not the route.** Do not require a section name or an order the
  artifact does not mandate; valid alternative answers must pass.
- **The practice text is the statistics key.** Rewording starts a new series in
  repeat/delta/benchmark. Capture a `--label` run before editing, then edit deliberately.

### Grounding (skill/agent)
- 1–3 short substrings the artifact **guarantees** (` ```mermaid `, a mandated heading).
- Every miss fails the case and skips the judge, so never use a substring the model may
  legitimately phrase differently, and never a free-text claim.
- Expect grounding to zero out baseline: a case gated on ` ```mermaid ` gives baseline
  `missing_data`, not per-practice numbers. Put the discriminating content practices in
  **other** cases where the judge always runs.

### Threshold
- With *n* practices the possible scores are *k/n*. Choose the threshold that allows exactly
  the misses you tolerate: 3 practices → 0.6 allows one miss; 5 → 0.8 allows one; 6 → 0.8
  allows one (5/6 = 0.83). Use 1.0 only for short, crisp lists.

## 4. Skill cases

- **No tools exist**, so inline everything the skill would gather (package lists, sizes, grep
  output) and tell the model to treat it as collected and not ask for tools.
- A skill that normally runs a script is tested on its **interpretation** layer: feed the
  script's output as text (see `skills/dependency-checker`, case "turns a collected report…").
  The script itself is tested with ordinary unit tests, not evals.
- `maxTurns` buys nothing here (all recorded skill runs are 1 turn).
- **Trigger/activation is not tested here** — the skill is injected, so it always "fires".
  Whether the `description` makes Claude load the skill is a workflow `activation` case.

## 5. Agent cases

- **Inline the input as a fixture** (`fixtures/*.diff` + `fixtureReader(import.meta.url)`),
  so the prompt is "Audit this diff …" + the diff. Synthetic diffs with plausible repo paths.
- The agent runs **with tools in the real repo**: it may read any file. Practices must judge
  the **output** ("flags X as a violation of Y", "quotes the offending line"), never which
  files it read — the judge cannot see the trace.
- **Make the discriminating case name repo-specific rules.** Textbook violations are named by
  any model; a rule identifier only your docs define is what separates "has the agent" from
  "raw model". Pair "detects the problem" with "cites rule X" so a failure shows which half broke.
- **Always include a benign negative** (a diff that violates nothing). It exposes fabricated
  findings, which no positive case can.
- **Keep practices in sync with the agent's current output contract** (severity names, report
  sections, rule identifiers). When the agent changes them, the cases must change in the same
  commit, or they fail regardless of quality.
- **A/B two variants with one shared cases file** (`architecture-reviewer-lite` imports the
  strict cases) — the injected definition is then the only variable. Both `.md` files must
  exist in `.claude/agents/`.
- `maxTurns`: every tool call is a turn; doc-reading agents need ~25. A run that hits the limit
  keeps partial text and is judged anyway — check `num_turns` when an agent case fails.

## 6. Workflow cases

| `kind` | Use it to check | Passes when |
|---|---|---|
| `dispatch` | a prompt makes the main agent launch subagent X | trace contains `expectSubagent` (session stops early once launched) |
| `activation` | a skill fires on a prompt — or does **not** | Skill tool called, or its `SKILL.md` read, exactly when `shouldActivate` |
| `trace` | several facts about one session | ALL of `expectSubagents`, `expectSkills`, `expectFilesRead`, `expectText` hold, none of `forbidText`, and the run did not error |
| `contrast` | that CLAUDE.md (not the model's habits) causes a read | `expectFileRead` read in the real repo **and not** in an empty control dir |

Rules:
- **Make the behaviour observable.** Name the action in the prompt: "OPEN (Read) X before
  answering, do not answer from memory", "you MUST launch the subagent, do not review it
  yourself". Put the dispatch instruction last.
- **Activation always comes in pairs:** a should-fire prompt and a near-miss should-not-fire
  prompt on the same topic (record a discovery vs explain the topic). Near-misses share
  keywords; trivial negatives test nothing. Run them in separate sessions.
- **Nested `CLAUDE.md` never appears in `filesRead`** — it is injected when a file in that
  package is opened. Assert it with `expectText` on a fact that exists only there
  (`COLUMN_KEYS`, `run.repo.ts`), and make the prompt open a file in that package.
- **`expectFilesRead` matches by substring on the raw path.** Use the shortest unique
  repo-relative tail (`server/README.md`). Known gap: paths are not normalised, so on Windows a
  `/` expectation can miss a read recorded with `\`. Until the engine normalises, verify one
  run on Windows before trusting a read expectation.
- **INSIGHTS.md reads are noise**: project hooks make the model read them in almost every
  session. Never use one as evidence unless the prompt asks for it.
- **Fold compatible checks into one `trace` session** to save budget, one theme per prompt —
  one flaky topic fails the whole case.
- **Size `maxTurns` at ≥ 1.5× the observed maximum.** Exceeding it sets `isError`, which fails
  `trace` and counts as a failed run. Observed: docs-read 3–5 turns, nested-CLAUDE.md case
  13–15, dispatch 5–18, activation 3–9.
- **Stay read-only.** Say "change nothing" in the prompt; never add Bash/Write/Edit to the
  workflow tools (sessions run with `bypassPermissions`).
- The workflow record's `outcome` means "the run did not error", **not** "the assertions
  passed" — read vitest's output for the assertion result.

## 7. Validate the cases, not just the artifact

Run `pnpm eval:benchmark <pattern> -n 5` (skills/agents) and read the flags:

| Flag | Meaning | Action |
|---|---|---|
| `non_discriminating` | passes with and without the artifact | sharpen the input or the practice, or drop it |
| `always_failing` | fails in both | suspect the case first: read the judge's quote in `records.jsonl` and the output in `results/outputs/` |
| `flaky` | 20–80% pass rate | ambiguous wording — make the practice narrower |
| `cost_regression` | candidate > 125% of baseline tokens | decide whether the lift is worth it |
| `missing_data` | no judged records | usually the grounding gate blocked the judge |

- **n < 5 is indicative only.** At n = 2 one run moves a rate by 50 points.
- **Discard infrastructure failures.** A record with < 1 s duration, 0 tokens and no score is
  not a result: the output file will show e.g. a session-limit message. Re-run, do not analyse.
- **A strong model at 0% means a broken case or grader** until proven otherwise.
- **Read failing transcripts** before blaming the artifact: confirm the FAIL is a real mistake,
  not the judge rejecting a valid answer.

## 8. Checklist before you commit a case

- [ ] Each practice tests something the artifact adds (would plausibly fail without it).
- [ ] The prompt contains raw facts, not the conclusions the practices check.
- [ ] Fixture facts are correct and consistent with every practice.
- [ ] Each practice: one condition, self-contained, quotable, positive where possible.
- [ ] No practice requires "matches the data" — forbidden content is named explicitly.
- [ ] Grounding only on strings the artifact guarantees.
- [ ] Threshold matches the misses you accept for this practice count.
- [ ] At least one negative / near-miss / benign case per artifact.
- [ ] Agent cases match the agent's current output contract (severities, rule ids).
- [ ] Workflow: action named in the prompt, `maxTurns` ≥ 1.5× observed, read-only.
- [ ] `eval:benchmark -n 5` run; flags handled.

## 9. Asking an agent to write cases

> Read `evals/docs/writing-cases.md` and `<.claude/skills/X/SKILL.md | .claude/agents/X.md>`.
> List the artifact's rules a raw model would not follow. For each, design an input of raw
> facts where breaking the rule is tempting, and write self-contained, single-condition,
> quotable practices. Add one negative case. 2–4 cases, 3–6 practices each, in
> `evals/<skills|agents>/X/X.cases.ts` (scaffold with `pnpm eval:scaffold`). Report which rule
> each practice covers.

## 10. Known engine gaps (as of 2026-10-08)

- `filesRead` paths are not normalised (`/` vs `\`) — see section 6.
- The judge's score denominator is the number of verdicts it returned, not the number of
  practices; a judge that drops one inflates the score.
- `kind` on skill/agent cases is not read by the runner (section 1).
- An agent run that hits `maxTurns` is judged on its partial text without a warning.

## Sources

- Engine: `src/tasks.ts`, `src/artifacts/load.ts`, `src/runtime/run-claude.ts`,
  `src/dsl/case.ts`, `src/scoring/llm-judge.ts`, `src/scoring/pattern-match.ts`, `src/config.ts`.
- Observed failures: `results/records.jsonl` (dependency-checker runs 2026-10-07; workflow runs
  2026-10-08).
- [skill-creator SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)
  — prompts before assertions, with/without-skill baseline, non-discriminating assertions,
  should-trigger / should-not-trigger query sets.
- [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
  — unambiguous tasks, no hidden requirements, balanced positive/negative sets, grade outcomes
  not steps, read transcripts, 0% means suspect the task.
- [Develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) — edge
  cases, constrained judge output, a judge model different from the generator.
