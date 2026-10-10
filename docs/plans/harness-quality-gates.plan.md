# Implementation plan: Harness quality gates (SPEC-06)

**Route** — A (spec-driven).
**Requirements source** — `specs/SPEC-06-harness-quality-gates.md` (Status: approved, 0
`[NEEDS CLARIFICATION]` markers, specs guard green). AC-1…AC-46 and NFR-1…NFR-9 keep the spec's
numbering. This plan implements those requirements; it does not define or change them.
**Execution mode** — multi-agent (3 lanes: A ∥ B ∥ C, then a 2-item integration pass run by the
orchestrator). The caller's brief recorded this as settled on 2026-10-08.
**Out of scope** — everything in the spec's *Non-goals*: other commit-producing commands, git
aliases, scripts and heredoc shells (EC-10); Claude Code's own fail-open paths (EC-11); retries,
locks and `--it` inside the gate; an agent escape hatch; `eval:benchmark -n 5`; CI workflow
changes; Stryker beyond `scoring.ts`, a score threshold, or Stryker in verify or CI; any edit to
`scoring.ts` production code (AC-45 exception only). Separate agents do the architecture review
and the security review.

## Requirements traceability

| Req | Requirement (short, see the spec line) | Source | Work items | Checked by |
|---|---|---|---|---|
| AC-1 | exactly four `SkillCase`s through `skillTask`; `pnpm vitest run skills/frontend-ui-architecture` | `specs/SPEC-06…md:111-121` | WA1 | WA1, WA2 `Done means` |
| AC-2 | placement fixture (a)/(b)/(c); grounding `_components/` | `:123-138` | WA1, WA2 | WA2 |
| AC-3 | anatomy/barrels fixture with three traps | `:140-154` | WA1, WA2 | WA2 |
| AC-4 | logic/state fixture with four traps | `:156-171` | WA1, WA2 | WA2 |
| AC-5 | negative fixture that follows every convention | `:173-189` | WA1, WA2 | WA2 |
| AC-6 | no prompt or fixture states the rule or verdict | `:191-195` | WA1, WA5 | WA5 |
| AC-7 | 3–5 self-contained practices; threshold 0.6 / 0.75 / 0.8 | `:197-200` | WA1, WA2 | WA1 |
| AC-8 | 4 passed in one run on the CI models | `:202-205` | WA2 | WA2 |
| AC-9 | 3 consecutive runs each ≥ 3/4 | `:207-209` | WA3 | WA3 |
| AC-10 | infrastructure-failed runs discarded, repeated, listed | `:211-215` | WA2, WA3, WA4, WA5 | WA5 |
| AC-11 | deliberate break → ≥ 1 judge FAIL, quote recorded | `:217-220` | WA4 | WA4 |
| AC-12 | revert → `git diff --exit-code -- .claude/skills/frontend-ui-architecture` exits 0 | `:222-224` | WA4, WI2 | WA4, WI2 |
| AC-13 | after the revert, 4 passed (≤ 1 re-run, both recorded) | `:226-228` | WA4 | WA4 |
| AC-14 | no commit contains the broken SKILL.md | `:230-232` | WA4, WI2 | WI2 |
| AC-15 | eval README documents the five things | `:234-243` | WA5 | WA5 |
| AC-16 | `ci-detect` maps the new folder to `frontend-ui-architecture` | `:245-251` | WA1 | WA1 |
| AC-17 | one new `PreToolUse` entry; existing entries byte-identical | `:255-265` | WB3, WI1 | WB3, WI1 |
| AC-18 | non-commit command → exit 0, silent, no git, no check, no log | `:267-271` | WB1, WB2 | WB2 |
| AC-19 | `git commit` in any segment → one gated decision per call | `:273-278` | WB1, WB2 | WB1, WB2 |
| AC-20 | commit inside `( )`, `$( )`, backticks, `bash -c`/`sh -c`/`pwsh -c`/`powershell -Command`/`cmd /c` | `:280-289` | WB1 | WB1 |
| AC-21 | assignments, wrappers, git global options, `git.exe`/paths | `:291-300` | WB1 | WB1 |
| AC-22 | quoted, heredoc, here-string, comment, argument → not a commit | `:302-312` | WB1 | WB1, WB2 |
| AC-23 | PowerShell syntax for AC-18…AC-22 | `:314-323` | WB1 | WB1 |
| AC-24 | `--no-verify`/`-n`/clustered `-anm` → exit 2 without checks | `:325-333` | WB1, WB2 | WB1, WB2 |
| AC-25 | touched paths = staged ∪ unstaged ∪ untracked; renames both; work tree cwd → `cd` → `-C` | `:335-349` | WB2 | WB2 |
| AC-26 | path prefix → target table | `:351-363` | WB2 | WB2 |
| AC-27 | empty target set → allow, log `targets: []`, `no_targets` | `:365-367` | WB2 | WB2 |
| AC-28 | fixed order `hooks, specs, reviewer-core, mcp, server, client`; exact invocations | `:369-376` | WB2 | WB2 |
| AC-29 | all green → exit 0, no output | `:379-381` | WB2 | WB2 |
| AC-30 | red → exit 2; target + step, ≤ 40-line tail, fixed closing line | `:383-391` | WB2 | WB2 |
| AC-31 | stop at the first red target | `:393-395` | WB2 | WB2 |
| AC-32 | internal errors → exit 2 with a named reason | `:397-406` | WB2 | WB2 |
| AC-33 | 540 s deadline → kill the process tree, exit 2 | `:408-411` | WB2 | WB2 |
| AC-34 | no top-level `scripts/verify.mjs` → allow, log `out_of_scope` | `:413-416` | WB2 | WB2 |
| AC-35 | one JSON line per decision in `.devdigest/cache/commit-gate.jsonl` | `:418-423` | WB2 | WB2 |
| AC-36 | a failed append leaves the decision unchanged | `:425-428` | WB2 | WB2 |
| AC-37 | `docs/harness/commit-test-gate.md` content | `:430-442` | WB4 | WB4 |
| AC-38 | "Caught cases" entry matches a `"result":"block"` log line | `:444-454` | WB4, WI1 | WI1 |
| AC-39 | `pnpm mutation:scoring`: scope, test file, perTest, aliases, clear-text + HTML | `:458-467` | WC1, WC2 | WC2 |
| AC-40 | Stryker devDeps via `pnpm add -D`; lockfile only via pnpm | `:469-473` | WC1 | WC1 |
| AC-41 | a run leaves `git status --porcelain` unchanged | `:475-477` | WC1, WC2 | WC2 |
| AC-42 | one focused, named test per non-equivalent survivor / no-coverage mutant | `:479-484` | WC3 | WC3 |
| AC-43 | equivalent mutants recorded with a reason, no test | `:486-488` | WC2, WC4 | WC4 |
| AC-44 | re-run: zero non-equivalent survivors; score ≥ baseline | `:490-494` | WC4 | WC4 |
| AC-45 | `scoring.ts` production code unchanged (defect exception) | `:496-500` | WC3, WI2 | WC3, WI2 |
| AC-46 | `server/docs/mutation-testing.md` content | `:502-511` | WC2, WC4 | WC4 |
| NFR-1 | non-commit command: median of 10 runs < 1 s | `:566-569` | WB3, WI2 | WB3 |
| NFR-2 | Node ≥ 22 built-ins + git CLI only; suite passes on Windows (and Linux) | `:571-574` | WB1, WB2 | WB2 |
| NFR-3 | the gate never executes command text | `:576-579` | WB1, WB2 | WB2 |
| NFR-4 | no env/flag/token changes the decision (only `CLAUDE_PROJECT_DIR` locates the project) | `:581-584` | WB2 | WB2 |
| NFR-5 | log: command ≤ 500 chars, leading assignment values → `***` | `:586-591` | WB2 | WB2 |
| NFR-6 | each assembled case prompt ≤ 6 KB | `:592-593` | WA1, WA5 | WA1 |
| NFR-7 | no committed key or token value | `:595-598` | WA1–WA5, WI2 | WI2 |
| NFR-8 | Stryker only on demand — not in verify, `verify:l06` or workflows | `:600-603` | WC1, WI2 | WC1, WI2 |
| NFR-9 | on the final commit, the five listed checks exit 0 | `:605-614` | WI2 | WI2 |

## Spec follow-ups

These are addressed to `spec-creator` and the user. None of them is applied here: the plan
implements the spec as written, and each technical reading it takes is under *Assumptions*.

- **SF-1 — AC-2…AC-5 vs AC-7.** AC-2…AC-5 say a case "shall pass only if" it does all of its
  listed things. AC-7 fixes a threshold that "admits at most one failed practice" (3 → 0.6,
  4 → 0.75), so the vitest case passes when one of those practices fails. The plan follows AC-7
  numerically, because AC-8 and AC-9 are measured by the vitest pass/fail that the threshold
  drives. AC-2's first condition is also enforced as a hard grounding gate. Suggest rewording
  AC-2…AC-5 to "grades exactly these practices".
- **SF-2 — AC-5 vs AC-7.** AC-5 lists two conditions, but AC-7 requires 3–5 practices. The plan
  adds one more practice to the negative case, taken from what the fixture already shows
  conforms (see WA1). It adds no new rule.
- **SF-3 — NFR-8's verify command.** `git grep -n "stryker\|mutation:scoring" -- scripts .github
  server/package.json` will also match the two `@stryker-mutator/*` devDependency lines that
  AC-40 requires. The plan checks that every match is in `server/package.json` and is either the
  `mutation:scoring` script or one of those two lines.
- **SF-4 — AC-45's verify command.** `git diff main -- server/src/modules/eval/helpers/scoring.ts`
  can never be empty on this branch. The file was added by `3cbe62f`, which is in `main..HEAD`,
  and `git diff --stat main` shows 151 insertions today. The plan checks against the commit the
  lane starts from: `git diff <start-sha> -- …scoring.ts`, where WC1 records `<start-sha>`.
- **SF-5 — audit-log contract.** The sequence diagram logs a block line for an internal error.
  That includes non-JSON stdin, where `tool_name`/`command` are unknowable. The contract types
  `tool` as `Bash | PowerShell` (required). The plan logs `tool: null, command: ""` in that one
  case.
- **SF-6 — NFR-2 vs AC-33 on Windows.** Killing a process tree on Windows needs the OS `taskkill`
  executable, because Node has no process-group kill there. NFR-2 says "Node built-ins and the
  git CLI", and its verify is "imports are all `node:` modules". The plan uses `taskkill` on
  win32 and process-group kill on POSIX.
- **SF-7 — AC-19 with two commits in different work trees.** For example,
  `git commit -m a && cd ../x && git commit -m b`. The spec does not say which work tree is
  checked. The plan resolves the work tree from the first commit invocation.
  **Superseded during implementation (security review, 2026-10-09):** the first-commit rule
  let `git -C <other repo> commit …; git commit -am real` through unchecked. The gate now
  resolves the work tree of EVERY commit invocation, gates the union of in-project trees, and
  treats any tree outside `CLAUDE_PROJECT_DIR` (or its worktrees) as `out_of_scope` without
  executing anything in it.

Added by the orchestrator after implementation (accepted deviations; the approved spec is not
edited — a future spec revision should adopt these wordings):

- **SF-8 — `node --test .claude/hooks/` cannot pass on Node 22 / Windows.** A directory argument
  is loaded as a module ("Cannot find module …\.claude\hooks"), so NFR-2, NFR-9 and AC-28's
  literal command exits 1 on this machine regardless of the code. The gate's `hooks` target and
  every check use the glob form `node --test ".claude/hooks/*.test.mjs"` (Node expands it). The
  spec's intent — "the hooks suite runs and passes" — is met.
- **SF-9 — AC-4 wording.** The calibrated practice accepts the `renderRow` helper being removed
  in favour of inline JSX in the `map` OR a PascalCase component, because `SKILL.md:129-131`
  forbids camelCase JSX-returning functions but does not require extraction, and the strict
  wording failed skill-conforming answers in runs 2–4. Suggested AC-4 wording: "removes the
  camelCase JSX-returning helper (inline JSX or a PascalCase component)". Documented in
  `evals/skills/frontend-ui-architecture/README.md`.

## Affected surface

| File | New/Mod | Package | Ring / home | Skills that will govern it | Constraint to respect |
|---|---|---|---|---|---|
| `evals/skills/frontend-ui-architecture/frontend-ui-architecture.eval.ts` | New | evals | skill eval entry | — (unrouted) | Same 3-line shape as `evals/skills/dependency-checker/dependency-checker.eval.ts:1-4` (`describeSkill` + `runSkillCases`) |
| `evals/skills/frontend-ui-architecture/frontend-ui-architecture.cases.ts` | New | evals | skill cases | — (unrouted) | `evals/docs/writing-cases.md:57-59` (answer never in the prompt), `:70-90` (practices self-contained, one condition, quotable), `:96-98` (threshold) |
| `evals/skills/frontend-ui-architecture/fixtures/{placement,anatomy-barrels,logic-state,negative}.txt` | New | evals | fixtures | — (unrouted) | Read through `fixtureReader(import.meta.url)` (`evals/src/artifacts/fixture.ts:11`, used in `evals/agents/architecture-reviewer/architecture-reviewer.cases.ts:2-4`). `evals/tsconfig.json` excludes `**/fixtures/**`, so fixture code is never typechecked. Use `.txt` to keep it inert |
| `evals/skills/frontend-ui-architecture/README.md` | New | evals | eval doc | — (unrouted) | Names env vars, never values (AC-15, NFR-7) |
| `.claude/skills/frontend-ui-architecture/SKILL.md` | Mod → reverted | harness | skill | — (`**/*.md` unrouted) | Temporarily broken in WA4. It must end byte-identical (AC-12) and is never committed broken (AC-14) |
| `.claude/hooks/commit-gate-parse.mjs` | New | harness | pure parser (no I/O) | security | `.claude/skills/security/SKILL.md:104-106`: no shell, no exec of input (NFR-3) |
| `.claude/hooks/commit-gate-parse.test.mjs` | New | harness | `node:test` suite | security | Built-ins only (NFR-2) |
| `.claude/hooks/commit-test-gate.mjs` | New | harness | hook entry + gate core | security | `security/SKILL.md:104-106`: spawn `git`/`node` with `execFile`/`spawn` argv arrays, never `shell: true`. Touched paths never reach a command line (spec *Untrusted inputs*) |
| `.claude/hooks/commit-test-gate.test.mjs` | New | harness | `node:test` suite | security | Must stay fast: the gate runs it for every commit that touches `.claude/hooks/` (AC-28) |
| `.claude/settings.json` | Mod | harness | hook registration | — (unrouted) | `.claude/settings.json:7-31` (`UserPromptSubmit`, `Stop`) stays byte-identical (AC-17) |
| `docs/harness/commit-test-gate.md` | New | docs | root `docs/<topic>.md` (new `harness/` folder per AC-37) | — (unrouted) | CLAUDE.md naming: one topic per file |
| `server/package.json` | Mod | api | manifest | security (`**/package.json`) | Changed only by `pnpm add -D` plus one `scripts` line. Never wire into `verify:l06` (`server/package.json:17`, NFR-8) |
| `server/pnpm-lock.yaml` | Mod (pnpm only) | api | lockfile | — | CLAUDE.md *Do-not-touch*: never hand-edit, only via pnpm |
| `server/stryker.config.json` | New | api | tool config | — (unrouted) | Adapted from `upstream/fix/numbered-diff-line-citations:server/stryker.config.json`; the `mutate` path differs here |
| `server/stryker.vitest.config.ts` | New | api | tool config | — (unrouted; outside `src/`, so not in `tsc`) | A copy of `server/vitest.config.ts:4-17` with `include` narrowed to `test/eval-scoring.test.ts` |
| `.gitignore` | Mod | root | ignore rules | — (unrouted) | `.gitignore` has no inline comments (its own note). Anchor patterns with a leading `/` |
| `server/test/eval-scoring.test.ts` | Mod | api | unit test (ring-1 subject, no DB) | — (onion excludes tests) | `server/INSIGHTS.md:110`: `tsc` does not cover `server/test/**`, so prove new tests by running them. The `.test.ts` suffix is unit lane, never `.it.test.ts` |
| `server/docs/mutation-testing.md` | New | api | package deep-dive | — (unrouted) | `server/docs/README.md:6-8`: one file per topic plus an index line |
| `server/docs/README.md` | Mod | api | docs index | — (unrouted) | Add one line for `mutation-testing.md` (its own rule, `:7-8`) |

**Coverage gaps:** everything under `evals/`, `.claude/settings.json`, every `*.md`,
`server/stryker.*`, `.gitignore` and `server/test/eval-scoring.test.ts` are unrouted in
`.claude/skill-routing.md`. No skill reviews them. The rules for the eval files come from
`evals/docs/writing-cases.md`, which is a doc, not a skill. Only the four `.claude/hooks/*.mjs`
files and `server/package.json` are routed, all to `security`.

## Contract changes

- **vendor/shared:** no.
- **Migration:** no.
- **Seed:** no.
- **Client build check needed:** no. No `client/` file changes.
- **i18n:** no.
- **Harness contract (new):** the audit-log line format in `.devdigest/cache/commit-gate.jsonl`
  (spec *Module interactions*). It is produced only by `commit-test-gate.mjs` and is gitignored
  (`.gitignore:19`).

## Work items

### Lane A — `frontend-ui-architecture` skill eval (evals)

#### WA1 — Scaffold the eval and write four cases with raw-fact fixtures
- **Serves:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-16, NFR-6, NFR-7.
- **Do:**
  - From `evals/`, run `pnpm eval:scaffold frontend-ui-architecture`. It creates the
    `.eval.ts`, `.cases.ts` and `fixtures/` trio (`evals/src/scaffold.ts:1-9`) and refuses to
    overwrite.
  - Write four `SkillCase`s (`kind: "quality"`). Each prompt asks a normal task and inlines its
    fixture with `fx("<name>.txt")`, telling the model to treat the data as already collected.
    This is the pattern in `dependency-checker.cases.ts:8-35`.
  - **Placement** (`fixtures/placement.txt`). Give raw import facts only:
    - (a) a component imported only by `app/pulls/page.tsx`;
    - (b) a component imported by three named routes;
    - (c) a needed status chip/badge, plus a listing of what `src/vendor/ui` exports. The listing
      includes the matching primitive, e.g. `SeverityBadge` or `Chip` (`SKILL.md:51-53`).

    Set `grounding: ["_components/"]`. Write 3 practices, one per AC-2 bullet, with
    `threshold: 0.6`.
  - **Anatomy/barrels** (`fixtures/anatomy-barrels.txt`). Include:
    - a `src/components/index.ts` re-exporting 12 named components;
    - a `lib/utils.ts` with 2–3 functions;
    - a `FindingCard/FindingCard.tsx` with `import … from "./index"`.

    Ask for a structure review. Write 3 practices, one per AC-3 bullet, with `threshold: 0.6`.
    No grounding.
  - **Logic/state** (`fixtures/logic-state.txt`). Give one component with:
    - `useState(query.data)`;
    - a `renderRow()` that returns JSX;
    - `const [total, setTotal] = useState(...)` kept in sync by an effect;
    - a pure `useFormatCost`.

    Write 4 practices, one per AC-4 bullet, with `threshold: 0.75`.
  - **Negative** (`fixtures/negative.txt`). Give a route-local `_components/RunTimeline/` folder
    that matches every AC-5 bullet: a long single-purpose component (~150+ lines described or
    shown in brief), `constants.ts` with an `as const` map, `helpers.ts`, `styles.ts` exporting
    `s`, a one-component `index.ts`, and a colocated test. Ask whether it should be restructured.
    Write 3 practices with `threshold: 0.6`:
    - the AC-5 statement "no structural change needed";
    - the AC-5 statement "length alone is not a reason to split";
    - a third practice (SF-2): it states that the one-component `index.ts` barrel is acceptable
      as written (`SKILL.md:76-92`).
  - Every practice is one positive, quotable condition. It names the exact file/component from
    the fixture, so the blind judge needs no context (`writing-cases.md:70-90`).
  - No prompt or fixture says "so it belongs in…", "this is a barrel anti-pattern", or any
    verdict (AC-6). Facts only: "imported by `app/pulls/page.tsx` only".
- **Files:** the eval, the cases file and the 4 fixtures in the Affected surface.
- **Done means:**
  - `pnpm typecheck` in `evals/` exits 0.
  - `pnpm vitest list skills/frontend-ui-architecture` (or the run in WA2) shows exactly four
    tests under one `frontend-ui-architecture` describe block.
  - Each case has 3–5 practices and the threshold for its count (3 → 0.6, 4 → 0.75, 5 → 0.8).
  - Each assembled prompt is ≤ 6144 bytes. Measure it with a throwaway
    `node -e`/`tsx -e` that imports `cases` and prints `Buffer.byteLength(c.prompt)`, and keep
    the numbers for the README.
  - `CHANGED_FILES=evals/skills/frontend-ui-architecture/frontend-ui-architecture.cases.ts node evals/scripts/ci-detect.mjs`
    prints `skills=["frontend-ui-architecture"]`.
  - `node --test evals/scripts/ci-detect.test.mjs` stays green.
  - No key-like string appears in any new file.
  - If `vitest list` is not a valid subcommand in the installed vitest, rely on WA2's run output
    instead. Do not research it.
- **Verify:** `pnpm typecheck` (dir `evals/`), the `ci-detect` command above (repo root), and
  `node --test evals/scripts/ci-detect.test.mjs` (repo root).
- **Rules that apply:**
  - `evals/docs/writing-cases.md` §3: raw facts, not conclusions; self-contained, positive,
    one-condition practices; grounding only on guaranteed substrings; threshold table.
  - `writing-cases.md` §4: no tools, so inline everything.
  - `frontend-ui-architecture` SKILL.md is the *subject*. Each practice cites the SKILL.md
    section it protects, as a code comment above the practice (WA5 reuses it).
- **Risk:** low. The only risk is a fixture that leaks the verdict, which makes the case
  non-discriminating. WA4 exposes that.

#### WA2 — Calibrate on the CI models until one run passes 4/4 (LIVE)
- **Serves:** AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-10.
- **Do:**
  - This item makes **live OpenRouter calls**. The implementer runs it, not a test.
  - The skill tier on `openrouter` needs no proxy (`evals/README.md:82-83`).
  - Env vars do not persist between Bash calls, so each run is one command from `evals/`:
    ```
    OPENROUTER_API_KEY="$(node -p "require(require('os').homedir()+'/.devdigest/secrets.json').OPENROUTER_API_KEY")" \
    EVAL_BACKEND=openrouter EVAL_MODEL=anthropic/claude-haiku-5.5 EVAL_JUDGE_MODEL=deepseek/deepseek-v4.1-flash \
    pnpm vitest run skills/frontend-ui-architecture
    ```
  - Never print, log or echo the key.
  - After each red run, read the judge verdicts and quotes in the newest `evals/results/`
    record. Decide whether the FAIL is a real miss or a badly worded practice
    (`writing-cases.md:182-185`), then reword the practice, not the skill.
  - Log every rewording (old → new, why) and every run (time, result, record file) in a scratch
    list for WA5.
  - Discard and repeat any run with an infrastructure failure: a record < 1 s with 0 tokens and
    no score, or an OpenRouter error (AC-10).
- **Files:** `frontend-ui-architecture.cases.ts`, fixtures (wording only).
- **Done means:**
  - One non-discarded run prints `4 passed` with the three CI model env values.
  - The placement case's record shows grounding passed (`_components/` present) and judge
    PASSes.
  - Every rewording and discarded run is listed for WA5.
- **Verify:** the live command above, plus `pnpm typecheck` in `evals/` after the last edit.
- **Rules that apply:** `writing-cases.md` §3 *"The practice text is the statistics key"*. Reword
  deliberately and record it.
- **Risk:** cost and time of repeated live runs. Each run is 4 task calls + ≤ 4 judge calls on
  cheap models.

#### WA3 — Stability: three consecutive runs (LIVE)
- **Serves:** AC-9, AC-10.
- **Do:**
  - With the cases frozen after WA2, run the WA2 command three times in a row with no edits in
    between.
  - Record each result (passed/total, failing case and practice if any, record file).
  - An infrastructure failure is discarded and repeated (AC-10). A wording edit restarts the
    three.
- **Files:** none (evidence only).
- **Done means:** three counted consecutive runs, each with ≥ 3 of 4 passed, are listed with
  their record file names for WA5.
- **Verify:** the WA2 live command, ×3.
- **Rules that apply:** `writing-cases.md:180-181` (discard rule).
- **Risk:** a flaky practice. If a run drops below 3/4, return to WA2 wording, then restart the
  three.

#### WA4 — Sensitivity: break SKILL.md → red → revert byte-identical → green (LIVE)
- **Serves:** AC-11, AC-12, AC-13, AC-14, AC-10.
- **Do:**
  1. Confirm a clean start: `git diff --exit-code -- .claude/skills/frontend-ui-architecture`
     exits 0. If it does not, stop and report. Never revert someone else's edit.
  2. Break `SKILL.md` only. Either:
     - remove the barrel rules (`SKILL.md:93-103`), the `utils.ts` rule (`:159-164`) and the
       anatomy table; or
     - invert one graded rule, e.g. make §3 say "split any component over 100 lines".

     Record exactly what was removed or inverted.
  3. Run the WA2 command. Pass condition: at least one case fails with a judge **FAIL** verdict.
     Copy that FAIL's verbatim evidence quote from the `evals/results/` record.
  4. If no case went red (EC-20), revert, pick a stronger break, and repeat. Record both
     attempts.
  5. Revert with `git checkout -- .claude/skills/frontend-ui-architecture/SKILL.md`. Then
     `git diff --exit-code -- .claude/skills/frontend-ui-architecture` must exit 0. Keep the
     exit code.
  6. Run the WA2 command again. Expect `4 passed`. At most one re-run is allowed for a judge
     flake (EC-21). Record both runs.
  - **Nobody commits during this item.** The broken file must never reach a commit (AC-14). The
    lane ends with the revert verified.
- **Files:** `.claude/skills/frontend-ui-architecture/SKILL.md`. It is changed temporarily and
  ends unchanged.
- **Done means:**
  - A recorded red run with a judge FAIL and its verbatim quote.
  - `git diff --exit-code -- .claude/skills/frontend-ui-architecture` exits 0 after the revert.
  - A post-revert run shows `4 passed`, within ≤ 2 runs.
  - The lane-A report states "SKILL.md reverted, diff exit 0" explicitly.
- **Verify:** the live command (×2–4) and the `git diff --exit-code` command above (repo root).
- **Rules that apply:** spec AC-11…AC-14. CLAUDE.md: no commit from the lane.
- **Risk:** **cross-lane.** While SKILL.md is broken, any agent that loads the
  `frontend-ui-architecture` skill gets the broken text. See *Execution → Isolation*. Keep the
  break window to the minimum: break → one run → revert.

#### WA5 — Eval README with all evidence
- **Serves:** AC-15, AC-6, AC-10, NFR-6, NFR-7.
- **Do:** write `evals/skills/frontend-ui-architecture/README.md` with these sections:
  1. **What each case protects**, by SKILL.md section and line.
  2. **AC-6 review**: one line per practice confirming that neither the prompt nor the fixture
     states its rule or verdict.
  3. **Calibration notes**: each practice rewording (old → new, why).
  4. **Stability runs**: the three from WA3.
  5. **Sensitivity run**: what was broken, every attempt, which case went red, the verbatim FAIL
     quote(s), the `git diff --exit-code` exit 0, and the green re-run(s).
  6. **Discarded runs**, each with its reason.
  7. **Prompt sizes** (NFR-6).
  8. **Run commands**: name `OPENROUTER_API_KEY`, `EVAL_BACKEND`, `EVAL_MODEL` and
     `EVAL_JUDGE_MODEL`. Show the model slugs, which are not secrets. Never show a key value.
     Note that the key is exported for the process from `~/.devdigest/secrets.json`.
- **Files:** `evals/skills/frontend-ui-architecture/README.md`.
- **Done means:**
  - The README has all eight sections above.
  - Every run cited in it names its `evals/results/` record file.
  - `git grep -nE "sk-or-v1-|sk-ant-" -- evals/skills/frontend-ui-architecture` prints nothing.
- **Verify:** the `git grep` above (repo root).
- **Rules that apply:** NFR-7. `writing-cases.md` §7 (discard rule).
- **Risk:** low.

### Lane B — PreToolUse commit test gate (harness)

#### WB1 — Pure command classifier (Bash and PowerShell syntax)
- **Serves:** AC-18 (classification), AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, NFR-3, NFR-4.
- **Do:** create `.claude/hooks/commit-gate-parse.mjs`. It has no imports and no I/O, and it
  exports:
  - `findCommits(command, tool)`. It returns `[]` or a list of commit invocations, each
    `{ commitArgs: string[], cdDirs: string[], gitC: string[] }`. Here `cdDirs` holds the
    `cd <dir>` segments before it in the same command, in order, and `gitC` holds its `-C`
    paths, in order.
  - `bypassFlag(commitArgs)`. It returns `"--no-verify" | "-n" | null`.

  **A tokenizer that never throws.** On anything it cannot parse it returns its best
  classification. A thrown parse error would turn every odd non-commit command into a blocked
  call once the hook is live.

  **Bash rules:**
  - Quoting:
    - `'…'` is literal.
    - `"…"` is literal except `$( … )` and backticks inside it, which are parsed as commands.
    - backslash escapes.
  - `#` starts a comment at word start.
  - Heredoc bodies are skipped: `<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"`.
  - Separators: `&& || ; | &` and newline.
  - `( … )`, `$( … )` and backticks are recursed into.

  **PowerShell rules (`tool === "PowerShell"`):**
  - Quoting:
    - `'…'` with `''` as the escape.
    - `"…"` with the backtick escape. `$( … )` inside it is parsed.
    - Here-string bodies `@'…'@` and `@"…"@` are skipped.
  - Comments: `#` and `<# #>`.
  - Separators: `; && || |` and newline.
  - `&` is the call operator.

  **Simple-command recognition:**
  - Strip leading `NAME=value` words.
  - Strip wrappers: `env` with its options and assignments, `command`, `builtin`, `exec`,
    `time`, `nohup`, `sudo` with its options, and PowerShell `&`.
  - The command word must be `git`, `git.exe`, or a path ending in `/git`, `\git`, `git.exe`
    (quotes allowed).
  - Skip git global options: `-C <p>` (collected), `-c <kv>`, `--git-dir=…`, `--work-tree=…`,
    `--no-pager`.
  - The first remaining word must be `commit`. Anything else (`log`, `status`) is not a commit.
  - `echo git commit` and `grep "git commit"` are not commits, because `git` is not the command
    word.

  **Nested shells.** When the command word is `bash`/`sh`/`zsh` with `-c <script>`, recurse with
  Bash rules. When it is `pwsh`/`powershell` with `-c`/`-Command <script>`, recurse with
  PowerShell rules. When it is `cmd /c <rest>`, recurse on the rest with `&& || & |` separators.

  **`bypassFlag`:**
  - Scan `commitArgs` up to `--`.
  - `--no-verify` → hit. `-n` → hit.
  - In a short cluster (`-anm`), walk the letters. `n` is a hit. A value-taking letter (`m`,
    `F`, `c`, `C`, `t`) ends the cluster, and if it is the last letter, the next word is its
    value and is skipped.
  - The values of `-m`, `-F`, `-c`, `-C`, `-t`, `--author`, `--date`, `--template`, `--fixup`,
    `--squash`, `--cleanup`, `--trailer` and `--pathspec-from-file` (separate-word form) are
    skipped.

  Then create `.claude/hooks/commit-gate-parse.test.mjs` with table-driven `node:test` cases.
- **Files:** `.claude/hooks/commit-gate-parse.mjs`, `.claude/hooks/commit-gate-parse.test.mjs`.
- **Done means:** tables pass for every form below.
  - Non-commits (AC-18): `ls`, `git status`, `git log`, `pnpm test`.
  - AC-19: compound forms with each separator. `git commit -m a && git commit -m b` yields a
    non-empty result, and the gate (WB2) treats it as one decision.
  - AC-20: each nesting form. `bash -c`, `sh -c`, `pwsh -c`, `pwsh -Command`,
    `powershell -Command` and `cmd /c` are each classified as a commit.
  - AC-21: each prefix form.
  - AC-22: each negative form, including `git log --grep "git commit"`,
    `cat <<'EOF'\ngit commit\nEOF`, `# git commit`, `echo git commit` and
    `grep -r "git commit" .`.
  - AC-23: the PowerShell equivalents, including `@'…'@` with `git commit` inside (not a commit)
    and `& git commit -m x` (a commit).
  - AC-24: `--no-verify`, `-n` and `-anm x` are hits. `-m "-n"` and `-- -n` are not.
  - A fuzz-style loop of ≥ 500 random strings never throws.
  - The module's only imports are none or `node:` modules (NFR-2).
- **Verify:** `node --test .claude/hooks/commit-gate-parse.test.mjs` (repo root).
- **Rules that apply:** `security` → *Command Injection* (`SKILL.md:104-106`). Command text is
  untrusted. It is parsed and never evaluated (NFR-3).
- **Risk:** medium. Shell grammar is large, so the parser covers exactly the forms the spec lists
  (EC-10 lists the rest as non-goals). Over-matching blocks harmless calls. Under-matching lets a
  commit through. The table tests are the guard.

#### WB2 — Gate core: work tree, touched paths, targets, checks, deadline, audit log, entry
- **Serves:** AC-18, AC-19, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32,
  AC-33, AC-34, AC-35, AC-36, NFR-2, NFR-3, NFR-4, NFR-5.
- **Do:** create `.claude/hooks/commit-test-gate.mjs`. It exports
  `runGate(input, deps) → { exitCode, stderr, logLine | null }` and has a thin `main`.
  - **Entry guard.** `main` runs only when the file is executed directly
    (`import.meta.url === pathToFileURL(process.argv[1]).href`), so the tests can import it.
  - **`main` itself:**
    - reads all of stdin;
    - builds the real deps (`git` via `execFile`, `runCheck` via `spawn` of `process.execPath`
      with an argv array, `stdio: ['ignore','pipe','pipe']`);
    - sets the log path to `<CLAUDE_PROJECT_DIR ?? resolve(import.meta.dirname,'../..')>/.devdigest/cache/commit-gate.jsonl`;
    - writes `stderr`, appends the log line, and exits.
  - **Order inside `runGate`:**
    1. Parse the stdin JSON. If it fails → internal error (AC-32), logged with `tool: null`,
       `command: ""` (SF-5).
    2. A missing `tool_input.command` → internal error.
    3. `findCommits`. An empty result → exit 0, no stderr, **no log, no git** (AC-18). This path
       must not touch `deps.git` or the file system, which also gives NFR-1.
    4. `bypassFlag` on any invocation → exit 2 with a stderr saying the commit test gate cannot
       be bypassed from the agent. Log `reason: "bypass_flag"` (AC-24). No checks run.
    5. Resolve the work tree from the first invocation (SF-7): start at stdin `cwd`, apply each
       `cdDirs` entry relative to the previous one, then each `-C`. Run
       `git -C <dir> rev-parse --show-toplevel`. Git not runnable, or the query fails →
       internal error.
    6. No `<toplevel>/scripts/verify.mjs` → allow and log `out_of_scope` (AC-34).
    7. Collect the touched paths as a union (AC-25). Renames contribute both paths. Use these
       queries, or equivalents with the same sets:
       - `git -C <top> diff --cached --name-status -z -M`;
       - `git -C <top> diff --name-status -z -M`;
       - `git -C <top> ls-files --others --exclude-standard -z`.
    8. Map the paths to targets by prefix (AC-26). Empty → allow and log `targets: []` with
       `no_targets` (AC-27).
    9. Run the targets in fixed order `hooks, specs, reviewer-core, mcp, server, client`,
       stopping at the first red one (AC-28, AC-31):
       - a package target is `[execPath, ['scripts/verify.mjs', target]]` with cwd `<top>`, no
         file args and never `--it`;
       - `hooks` is `[execPath, ['--test', '.claude/hooks/']]` with cwd `<top>`.

       `step` is taken from verify.mjs's `FAIL <label> (` line. For `hooks`, the step is
       `node --test`.
    10. A red check → exit 2. The stderr has three parts (AC-30): `target` + `step`, the last
        ≤ 40 lines of that check's output, and the closing line
        `commit blocked by commit-test-gate: fix the failing checks, then commit again`.
    11. A spawn failure → internal error.
    12. The deadline is 540 s total across checks (injectable). On expiry, kill the running
        check's tree, exit 2, and log `reason: "deadline"` (AC-33). On POSIX the kill is a
        `detached: true` spawn followed by `process.kill(-pid, 'SIGKILL')`. On win32 it is
        `execFile('taskkill', ['/pid', pid, '/T', '/F'])` (SF-6).
    13. All green → exit 0 with empty stdout and stderr (AC-29).
  - **Log line** (AC-35, contract in the spec): `ts` (ISO UTC), `session_id`, `agent_type` (only
    if present), `tool`, `command`, `targets`, `result`, `reason`, `failing {target, step}` and
    `duration_ms`.
    - The command is redacted first: the value of every leading `NAME=value` word of every
      simple command becomes `NAME=***`.
    - Then it is truncated to 500 chars (NFR-5).
    - The append is `mkdirSync(recursive)` + `appendFileSync` inside a try/catch that swallows
      the error (AC-36).
  - **NFR-4.** The gate reads no `process.env` except `CLAUDE_PROJECT_DIR`, and only to place
    the log. Nothing in the command text changes the decision except what AC-24 defines.

  Then create `.claude/hooks/commit-test-gate.test.mjs`. It uses temporary git repos made with
  `git init` under `os.tmpdir()` and `-c user.email=… -c user.name=…`. In-scope repos get a
  stub `scripts/verify.mjs`. The `runCheck` fake is injected. Spawned-process tests are used only
  where the spec says "spawned" (AC-18, NFR-3, AC-32 stdin cases).
- **Files:** `.claude/hooks/commit-test-gate.mjs`, `.claude/hooks/commit-test-gate.test.mjs`.
- **Done means:**
  - The suite covers every `Verify: unit` of AC-18, AC-19, AC-24…AC-36 and NFR-2…NFR-5, as
    worded in the spec. That includes:
    - spawned `ls` / `git status` / `git log` / `pnpm test` → exit 0, empty output, log file
      absent;
    - AC-25: each of the three sets and each resolution step (cwd, `cd`, `-C`) changes the path
      set;
    - AC-28: the injected runner records exactly the expected `[target, argv]` sequence;
    - AC-31: after a red `specs`, no `server` or `client` invocation;
    - AC-33: deadline 1 s with a fake check that spawns a sleeping grandchild writing its pid →
      exit 2, and that pid is dead afterwards (`process.kill(pid, 0)` throws);
    - AC-34: a temp repo with no `verify.mjs` → allow + `out_of_scope`;
    - AC-36: an unwritable log path keeps exit 0 / 2;
    - NFR-3: `git commit -m x $(node -e "require('fs').writeFileSync('PWNED','')")` creates no
      `PWNED` in the cwd or the temp repo;
    - NFR-4: `SKIP_COMMIT_GATE=1 COMMIT_GATE=off git commit -m x` with a red fake is blocked,
      including with those variables set in `process.env`;
    - NFR-5: `OPENROUTER_API_KEY=sk-or-x git commit -m y` is logged as
      `OPENROUTER_API_KEY=*** git commit -m y`, and a 2,000-char command is logged at 500
      chars.
  - Every import in both `.mjs` files is a `node:` module or the sibling parser.
  - **Check:** `node --test .claude/hooks/` on Node 22.12 discovers and runs the two `*.test.mjs`
    files (reported test count > 0). It must **not** execute `insights-prompt.mjs`,
    `insights-stop.mjs`, `commit-gate-parse.mjs` or `commit-test-gate.mjs` as test files. If it
    does (the gate's `main` would then block on empty stdin), report it to the orchestrator: the
    spec fixes this command in AC-28 and NFR-9, so it is not a silent workaround.
  - The whole hooks suite runs in ≤ ~30 s. The gate runs it on every commit that touches
    `.claude/hooks/`.
- **Verify:** `node --test .claude/hooks/` (repo root).
- **Rules that apply:**
  - `security` → *Command Injection* (`SKILL.md:104-106`): argv arrays, never `shell: true`;
    touched paths are never passed to a command (spec *Untrusted inputs*).
  - `security` → ASI05: model-produced text is never executed.
- **Risk:**
  - **High-impact.** Once wired (WB3), a bug that exits 2 on a non-commit blocks every
    Bash/PowerShell call in the session. A non-commit must exit 0 before any I/O.
  - Windows tree-kill is the least portable part. Linux is not exercised by any CI job here, so
    NFR-2's Linux half rests on the POSIX branch being reviewed.

#### WB3 — Wire the hook in `.claude/settings.json` and measure NFR-1 (activates the gate)
- **Serves:** AC-17, NFR-1.
- **Do:**
  - **This is the last item of lane B**, run only after WB1 and WB2 are green.
  - Add one top-level `PreToolUse` array to `hooks` with one entry:
    ```json
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/commit-test-gate.mjs"],
            "timeout": 600,
            "statusMessage": "Commit gate: running tests…"
          }
        ]
      }
    ]
    ```
  - Leave the `UserPromptSubmit` and `Stop` blocks (`.claude/settings.json:7-31`) and `env`
    byte-identical.
  - Measure NFR-1 with a throwaway shell loop (not a committed file). Run it 10 times:
    ```
    echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"."}' | node .claude/hooks/commit-test-gate.mjs
    ```
    Time each run and take the median. Also time one `node scripts/verify.mjs server` run, as
    the expected gate runtime for a server-touching commit. Both numbers go to WB4.
- **Files:** `.claude/settings.json`.
- **Done means:**
  - `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"` exits 0.
  - `git diff -- .claude/settings.json` shows only the added `PreToolUse` block.
  - The NFR-1 median is < 1 s.
  - Whether the `args` exec form and the `${CLAUDE_PROJECT_DIR}` expansion work is confirmed
    live in WI1, not here.
- **Verify:** the two commands above (repo root).
- **Rules that apply:** AC-17 (exact field values).
- **Risk:** **this activates the gate.** From here on, every `git commit` through Claude's
  Bash/PowerShell tool is gated, in this session and in every subagent, if Claude Code picks up
  the settings change mid-session. That includes the orchestrator's final commit. Lanes A and C
  never commit, so the only effect on them is the < 1 s pass-through.

#### WB4 — Gate documentation (without the caught case)
- **Serves:** AC-37; prepares AC-38.
- **Do:** write `docs/harness/commit-test-gate.md` with these sections:
  1. **Why a hook, not an eval.** A hook is deterministic; an eval is probabilistic with a
     threshold.
  2. **Modelled on.** The two template examples are the `PreToolUse` prompt hook on
     `Bash(git push*)` in `upstream/Lesson-06-lab-finish:.claude/settings.json` and the setup
     snippet in `upstream/Lesson-06-lab-finish:.claude/skills/pr-self-review/SKILL.md:25-40`.
     Read them with `MSYS_NO_PATHCONV=1 git show <rev>:<path>`. Then list the three
     differences: command not prompt, fail-closed not fail-open, commit not push.
  3. **Detection rules.** AC-19…AC-24, plus the non-goals list from EC-10 verbatim.
  4. **What runs.** The target table, the order, no `--it`, and the 540 s deadline under the
     600 s hook timeout. Include the expected runtime from WB3: seconds for `hooks`/`specs`, and
     the measured `server` time.
  5. **The audit log.** Its path and the field table.
  6. **Bypass policy.** Commit from your own terminal, or start Claude with
     `--settings '{"disableAllHooks": true}'`. There is no agent escape hatch.
  7. **Claude Code's own fail-open limits** (EC-11): `node` missing from PATH, the hook dying
     before its handler, or the 600 s timeout. Also EC-12/EC-13 (flake, no lock).
  8. **NFR-1 measurement.**
  9. A `## Caught cases` heading with one line saying entries are appended as they happen. WI1
     fills the first entry.
- **Files:** `docs/harness/commit-test-gate.md`.
- **Done means:**
  - All nine sections are present.
  - The template citations resolve: `MSYS_NO_PATHCONV=1 git show upstream/Lesson-06-lab-finish:.claude/settings.json`
    prints the `Bash(git push*)` prompt hook.
  - No key values appear.
- **Verify:** the `git show` command above (repo root).
- **Rules that apply:** CLAUDE.md *Naming* (`docs/<topic>.md`, one topic per file).
- **Risk:** low.

### Lane C — Stryker mutation testing of `scoring.ts` (server)

#### WC1 — Install Stryker, add the config and the on-demand script, ignore its output
- **Serves:** AC-39, AC-40, AC-41, NFR-8.
- **Do:**
  - Record `<start-sha>` = `git rev-parse HEAD` for WC3's AC-45 check (SF-4).
  - In `server/`, run `pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner`. Pick
    the newest major whose `@stryker-mutator/vitest-runner` peer range includes the installed
    vitest `^2.1.8`. If pnpm prints a vitest peer warning, use the previous major. Never edit
    `pnpm-lock.yaml` by hand.
  - Add the script `"mutation:scoring": "stryker run stryker.config.json"` to
    `server/package.json` `scripts`. Do not touch `verify:l06`.
  - Create `server/stryker.config.json`, adapted from
    `MSYS_NO_PATHCONV=1 git show upstream/fix/numbered-diff-line-citations:server/stryker.config.json`:
    - `packageManager: "pnpm"`;
    - `testRunner: "vitest"`;
    - `vitest.configFile: "stryker.vitest.config.ts"`;
    - `mutate: ["src/modules/eval/helpers/scoring.ts"]` (not the upstream path);
    - `reporters: ["clear-text","html","progress"]`;
    - `htmlReporter.fileName: "reports/mutation/mutation.html"`;
    - `coverageAnalysis: "perTest"`;
    - `tempDirName: ".stryker-tmp"`;
    - `cleanTempDir: true`.
  - Create `server/stryker.vitest.config.ts` from
    `…:server/stryker.vitest.config.ts`: the same aliases as `server/vitest.config.ts:5-10`, with
    `include: ['test/eval-scoring.test.ts']`.
  - Append `/server/.stryker-tmp/` and `/server/reports/` to the root `.gitignore`, each on its
    own line, with no inline comments.
- **Files:** `server/package.json`, `server/pnpm-lock.yaml` (via pnpm), `server/stryker.config.json`,
  `server/stryker.vitest.config.ts`, `.gitignore`.
- **Done means:**
  - `pnpm install --frozen-lockfile` in `server/` exits 0 (AC-40).
  - `git grep -n "stryker\|mutation:scoring" -- scripts .github server/package.json` matches
    only `server/package.json`: the script line and the two devDependency lines (NFR-8, SF-3).
  - `node scripts/verify.mjs server` stays green (Stryker files sit outside `src/`, so
    `tsc`/arch:check do not see them).
- **Verify:** `node scripts/verify.mjs server` (repo root), `pnpm install --frozen-lockfile`
  (dir `server/`), and the `git grep` above.
- **Rules that apply:** `security` → `**/package.json` (devDeps only, no install scripts
  added). CLAUDE.md *Do-not-touch* (lock files via their package manager).
- **Risk:** a peer mismatch with vitest 2.1.x. Watch for it in the install output and fix it by
  choosing the major, not with `--force`.

#### WC2 — Baseline mutation run and survivor classification
- **Serves:** AC-39, AC-41, AC-43, AC-46 (baseline part).
- **Do:**
  - Save `git status --porcelain` to a scratch file.
  - Run `pnpm mutation:scoring` in `server/`.
  - **Check:** the dry run must resolve imports. Stryker runs from a sandbox copy under
    `.stryker-tmp/`, so `path.resolve(__dirname, '../reviewer-core/src')` points inside the
    sandbox. That only matters if `test/eval-scoring.test.ts` has a runtime import through
    `@devdigest/reviewer-core`. If the run fails on resolution, anchor that alias to the real
    server directory in `stryker.vitest.config.ts`. Do not switch to `inPlace`, which mutates
    the real file and endangers AC-41/AC-45.
  - Record the baseline totals: killed, survived, no-coverage, timeout and score.
  - Record every survivor and no-coverage mutant: mutator, line, original → mutated.
  - Classify each as **non-equivalent** (some input observably differs, and you can name it) or
    **equivalent** (state why no input can differ). Timeouts count as detected.
  - Compare `git status --porcelain` with the saved copy.
- **Files:** none committed (evidence for WC4).
- **Done means:**
  - The clear-text output lists mutants of `src/modules/eval/helpers/scoring.ts` only.
  - `server/reports/mutation/mutation.html` exists.
  - `git status --porcelain` is identical before and after.
  - Every survivor and no-coverage mutant has a classification and a one-line justification.
- **Verify:** `pnpm mutation:scoring` (dir `server/`) and `git status --porcelain` (repo root),
  before and after.
- **Rules that apply:** spec DR-13 (no-coverage counts as a survivor; timeout counts as
  detected).
- **Risk:** run time. Per-test coverage over one 151-line file is minutes, not hours (upstream
  note in its `stryker.vitest.config.ts`).

#### WC3 — One focused killing test per non-equivalent survivor
- **Serves:** AC-42, AC-45.
- **Do:**
  - For each non-equivalent survivor or no-coverage mutant from WC2, add one `it(...)` to
    `server/test/eval-scoring.test.ts`.
  - The test name references the mutator and line, e.g.
    `it("kills EqualityOperator @ scoring.ts:64 — line tolerance boundary is inclusive", …)`.
  - It asserts the observable behaviour that the mutant changes.
  - Do not change `scoring.ts`. If a survivor reveals a real defect (EC-25), stop and report to
    the orchestrator: the fix is a separate, documented item with its own test (AC-45), not part
    of this item.
  - If WC2 found no non-equivalent survivors (EC-26), this item adds nothing and says so.
- **Files:** `server/test/eval-scoring.test.ts`.
- **Done means:**
  - `node scripts/verify.mjs server test/eval-scoring.test.ts` is green on unmutated code.
  - `git diff <start-sha> -- server/src/modules/eval/helpers/scoring.ts` is empty (SF-4).
- **Verify:** `node scripts/verify.mjs server test/eval-scoring.test.ts` (repo root).
- **Rules that apply:**
  - `onion-architecture` §1: `scoring.ts` is ring 1, so the tests stay DB-free `.test.ts`.
  - `server/INSIGHTS.md:110`: a green typecheck says nothing about test files, so run them.
- **Risk:** low.

#### WC4 — Re-run and write the mutation doc
- **Serves:** AC-43, AC-44, AC-46.
- **Do:**
  - Re-run `pnpm mutation:scoring`. Confirm that each WC3-targeted mutant is now `Killed` and
    that zero non-equivalent survived/no-coverage mutants remain. The score must be > baseline,
    or = baseline when the baseline had none.
  - Write `server/docs/mutation-testing.md` with:
    - the command;
    - the "check the checker" rationale;
    - the baseline totals;
    - a survivor table (mutator, line, original → mutated, killing test name *or* equivalence
      reason);
    - the after totals;
    - a note that Stryker is on demand only (not in verify, `verify:l06` or CI).
  - Add one index line to `server/docs/README.md`.
- **Files:** `server/docs/mutation-testing.md`, `server/docs/README.md`.
- **Done means:**
  - The doc's totals equal the two command outputs.
  - Every baseline survivor appears in the table with a test name or a reason.
  - The after-run shows zero non-equivalent survivors.
  - `git status --porcelain` is unchanged by the run.
- **Verify:** `pnpm mutation:scoring` (dir `server/`) and `git status --porcelain` (repo root).
- **Rules that apply:** `server/docs/README.md:6-8` (one topic per file, plus an index line).
- **Risk:** low.

### Integration — owned by the orchestrator (main session), after all three lanes

#### WI1 — Controlled demonstration: a real gate block, recorded as the first caught case
- **Serves:** AC-38, AC-17 (live confirmation).
- **Do:**
  1. Confirm the hook is live. If Claude Code did not pick up the WB3 settings change
     mid-session, reload hooks (open `/hooks` or restart the session). Live means a test commit
     attempt below produces a line in `.devdigest/cache/commit-gate.jsonl`. If no line appears,
     the gate is not firing: stop and fix it before anything else.
  2. Stage the red check: create an untracked `.claude/hooks/zz-demo-red.test.mjs` containing
     one failing `node:test` assertion. This adds the `hooks` target, which runs first and
     fails fast.
  3. Through Claude's Bash tool, attempt `git commit -m "<real message>"` on the staged
     homework changes. The gate must block with exit 2 and the AC-30 stderr. Nothing is
     committed, because the hook runs before the tool.
  4. Copy these from `commit-gate.jsonl`:
     - the `"result":"block"` line's `ts` and `command`;
     - the `failing.target` and `failing.step`;
     - an excerpt of the stderr.
  5. Delete `zz-demo-red.test.mjs`.
  6. Fill the first entry under `## Caught cases` in `docs/harness/commit-test-gate.md`. It
     holds the timestamp, the command tried, the failing target and step, the output excerpt,
     what was fixed (the staged red test was removed), and the label **"controlled
     demonstration"**.
- **Files:** `docs/harness/commit-test-gate.md`. The temporary
  `.claude/hooks/zz-demo-red.test.mjs` is created and deleted, never committed.
- **Done means:**
  - The documented `ts` and command match a `"result":"block"` line in
    `.devdigest/cache/commit-gate.jsonl`.
  - `zz-demo-red.test.mjs` no longer exists.
  - `git log -1` is unchanged by the attempt.
- **Verify:** `grep '"result":"block"' .devdigest/cache/commit-gate.jsonl` (repo root), compared
  with the doc entry.
- **Risk:** if the hook does not fire, the "args" exec form or the `${CLAUDE_PROJECT_DIR}`
  expansion is the first suspect. Test it by piping a commit payload into the gate by hand, then
  fix WB3.

#### WI2 — Full verification, then the final commit through the gate
- **Serves:** NFR-9, NFR-7, NFR-8, AC-12, AC-14, AC-45, NFR-1 (re-measure if WB3 ran under
  load).
- **Do:** run the *Verification plan* below in full. Then read `docs/git-workflow.md` and commit
  on the homework branch, as CLAUDE.md requires. The commit passes through the gate:
  - Today's tree touches `.claude/hooks/`, `specs/` (SPEC-04/05/06 changes are in the working
    tree) and `server/`, so the gate runs `hooks`, `specs` and `server`, in that order.
  - Expect roughly the WB3-measured `server` verify time plus seconds.
  - If the unit suite's known load flake trips (`server/INSIGHTS.md:36`), re-run that test
    alone, then commit again (EC-12).
- **Files:** none.
- **Done means:**
  - Every row of the Verification plan passes.
  - The final commit is recorded in the audit log as `"result":"allow"` with
    `targets` ⊇ `["hooks","specs","server"]`.
- **Verify:** the Verification plan.
- **Risk:** total gate time near 540 s if `client/` is also touched (EC-14). The current change
  does not touch it.

## Execution

| Lane | Executor | Work items | Files (disjoint) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| A — skill eval | implementer | WA1→WA5 | `evals/skills/frontend-ui-architecture/**`, `.claude/skills/frontend-ui-architecture/SKILL.md` (temporary, reverted) | — | B, C | shared tree; see the SKILL.md note below |
| B — commit gate | implementer | WB1→WB4 (WB3 is the gate switch; WB4 may run before WB3) | `.claude/hooks/commit-gate-parse*.mjs`, `.claude/hooks/commit-test-gate*.mjs`, `.claude/settings.json`, `docs/harness/commit-test-gate.md` | — | A, C | shared tree |
| C — mutation testing | implementer | WC1→WC4 | `server/package.json`, `server/pnpm-lock.yaml`, `server/stryker.config.json`, `server/stryker.vitest.config.ts`, `.gitignore`, `server/test/eval-scoring.test.ts`, `server/docs/mutation-testing.md`, `server/docs/README.md` | — | A, B | shared tree; `pnpm add` touches only `server/` |
| Integration | orchestrator (main session) | WI1, WI2 | `docs/harness/commit-test-gate.md` (Caught cases only), temporary `.claude/hooks/zz-demo-red.test.mjs` | A, B, C | — | shared tree |

Dispatch each executor with this plan's path **and its lane id**. Each touches only its lane's
files. **No lane commits.** The orchestrator makes the only commit, in WI2.

**Isolation notes:**
- **SKILL.md break window (lane A, WA4).** Dispatch all three lanes in one message, so that B
  and C load their skills before A reaches WA4. Dispatch no new agent until lane A reports
  "SKILL.md reverted, diff exit 0". Lanes B and C govern no file with
  `frontend-ui-architecture`, so the exposure is low, but it is not zero.
- **Gate activation (lane B, WB3).** After WB3, any Bash/PowerShell call by lanes A and C passes
  through the gate. Non-commit calls exit 0 in < 1 s, so this is safe only because WB1 and WB2
  guarantee a non-throwing classifier and no I/O on that path.
- **CPU contention.** Lane C's Stryker run and lane B's NFR-1 timing can overlap. If the WB3
  median is close to 1 s, WI2 re-measures it on a quiet machine.
- **Live model calls (lane A).** WA2–WA4 call OpenRouter. They do not compete for local CPU,
  but they cost money. Discarded runs are expected, not failures.

**Integration cross-lane checks (WI2):**
- the gate's `hooks` target runs lane B's suite;
- `.gitignore` (lane C) still ignores `.devdigest/cache/` (lane B's log);
- AC-14 holds across lane A.

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs server` | repo root | — | typecheck clean · unit suite green (only a known load flake may be re-run alone, `server/INSIGHTS.md:36`) · arch:check no new violation |
| `node scripts/verify.mjs specs` | repo root | — | spec marker guard and its tests pass |
| `pnpm verify:l06` | `server/` | pnpm | green. **Needs Docker**: it includes `*.it.test.ts` files (`server/package.json:17`) |
| `node --test .claude/hooks/` | repo root | — | both hook suites green, test count > 0 |
| `node --test evals/scripts/ci-detect.test.mjs` | repo root | — | green |
| `pnpm typecheck` | `evals/` | pnpm | clean |
| `CHANGED_FILES=evals/skills/frontend-ui-architecture/frontend-ui-architecture.cases.ts node evals/scripts/ci-detect.mjs` | repo root | — | prints `skills=["frontend-ui-architecture"]` (AC-16) |
| `git diff --exit-code -- .claude/skills/frontend-ui-architecture` | repo root | — | exit 0 (AC-12) |
| `git log --oneline main..HEAD -- .claude/skills/frontend-ui-architecture` | repo root | — | prints nothing, after the final commit too (AC-14) |
| `git diff <start-sha> -- server/src/modules/eval/helpers/scoring.ts` | repo root | — | empty, or every hunk is a documented defect item (AC-45, SF-4) |
| `git grep -nE "sk-or-v1-\|sk-ant-"` | repo root | — | no output (NFR-7) |
| `git grep -n "stryker\|mutation:scoring" -- scripts .github server/package.json` | repo root | — | matches only the `mutation:scoring` script and the two `@stryker-mutator/*` devDependency lines (NFR-8, SF-3) |
| `git diff main -- .claude/settings.json` | repo root | — | only the added `PreToolUse` block (AC-17) |

Not in the plan: `pnpm mutation:scoring` (on demand, run inside lane C only), any `e2e` run,
and `node scripts/verify.mjs client` (`client/` is untouched). The live eval commands run only
inside lane A.

## Assumptions

Each of these is a technical call. The implementer may rely on it, and should challenge it if
reality disagrees.

- **Gate split.** The gate is two modules, a pure parser and an entry/core, plus two test files,
  all directly in `.claude/hooks/`. `commit-test-gate.mjs` is the path AC-17 fixes. The split
  keeps the parser I/O-free and table-testable.
- **`runGate(input, deps)` is the test seam.** AC-28, AC-31 and AC-33 need an injected runner and
  deadline. The spawned `main` is used only where the spec asks for a spawned gate.
- **Touched paths from the three git queries in WB2.** They give exactly AC-25's three sets.
  Renames come out as two paths from `--name-status -M`.
- **The work tree is resolved from the first commit invocation** in a call (SF-7).
- **Logging when tool is unknown.** An internal error before `tool_name` is known is logged with
  `tool: null`, `command: ""` (SF-5).
- **Windows tree-kill uses `taskkill`.** That reads NFR-2 as "no npm dependencies", per its
  verify text (SF-6).
- **Case thresholds follow AC-7.** That means 0.6 for 3 practices and 0.75 for 4, so one miss
  passes a case (SF-1). The negative case gets a third practice for AC-7 (SF-2).
- **Fixtures are `.txt` files read with `fixtureReader`.** The existing helper does this, and
  `evals/tsconfig.json` excludes `fixtures/`.
- **`OPENROUTER_API_KEY` is the key name in `~/.devdigest/secrets.json`.** Its keys were listed
  without printing values (`GITHUB_TOKEN`, `OPENROUTER_API_KEY`).
- **Stryker output stays out of `git status`** through two anchored root-`.gitignore` entries
  (`/server/.stryker-tmp/`, `/server/reports/`).
- **Unverified, checked inside items, not researched:**
  - `node --test <dir>` discovery on Node 22.12 (WB2);
  - the `args` exec form and `${CLAUDE_PROJECT_DIR}` expansion in a command hook, and whether
    settings reload mid-session (WB3/WI1);
  - the Stryker vitest-runner peer range for vitest 2.1.x (WC1);
  - alias resolution inside the Stryker sandbox (WC2);
  - the Stryker HTML reporter path, set explicitly in WC1.

## Open questions

None. The unverified tool facts above are each a `Done means` check with a stated fallback. Two
of them have no fallback and stop for the orchestrator: a `node --test .claude/hooks/` discovery
problem (WB2) and a real defect found in `scoring.ts` (WC3).

## Rollback / blast radius

- **Lane A:** delete `evals/skills/frontend-ui-architecture/`. SKILL.md is unchanged on the
  branch, by construction.
- **Lane B:** removing the `PreToolUse` block from `.claude/settings.json` disables the gate at
  once. The hook files are inert without it. If the gate itself misbehaves mid-session and
  blocks commits, the human bypass is to commit from one's own terminal, or to restart Claude
  with `--settings '{"disableAllHooks": true}'`. `.devdigest/cache/commit-gate.jsonl` is
  gitignored, local and safe to delete.
- **Lane C:** `pnpm remove @stryker-mutator/core @stryker-mutator/vitest-runner` in `server/`
  restores the manifest and the lockfile through pnpm. Delete the two config files, the
  `.gitignore` lines and the doc. The added tests are independent and may stay.
- Nothing here is irreversible: no migration, no seed, no remote state. The one externally
  visible side effect is OpenRouter spend from lane A's live runs.
