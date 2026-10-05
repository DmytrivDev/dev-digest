# Implementation plan: `[NEEDS CLARIFICATION]` markers in specs

**Route** — B (no spec). This is agent and process tooling, not a product feature.
**Requirements source** — a user request relayed by the caller on 2026-10-05: mentor
feedback *"у spec-creator немає правила [NEEDS CLARIFICATION] — з ним агент позначає
незрозуміле замість того, щоб домислювати відповідь"*, plus a four-item user-approved
direction (inline marker · spec-creator rules · downstream docs · mechanical guard). It is
restated as R1–R13 below and was confirmed in Pass 1. This plan implements those
requirements; it does not define or change them.
**Execution mode** — single-agent, two sequential `implementer` phases (P1, P2), then one
smoke-test phase (P3) run by the main session in a fresh chat. Chosen by the user on
2026-10-05.
**Out of scope** — the items below. Architecture review and security review are done by
separate agents.
- No change to `plan-verifier` (Rec3, accepted).
- No change to the "default" pattern in `brainstorm.md`, `researcher.md`, or the
  planner's own Route B Pass 1 (Rec4, accepted).
- No retro-fix of SPEC-01..03. They contain no marker today. The SPEC-03 DR-56 ordering
  (`specs/SPEC-03-pr-brief.md:1011`) is an implemented decision; changing it would need a
  superseding spec.

Evidence the problem is real:
- `.claude/agents/spec-creator.md:358`: every Pass 1 question carries
  `default: <what I assume if unanswered>`.
- `.claude/agents/spec-creator.md:205`: Pass 2 is gated on "answered or its default
  accepted". Nothing says what happens to a point that was never asked.
- `.claude/agents/spec-creator.md:394-395`: the "No silent decisions" bar exists, yet the
  SPEC-03 Pass 2 report said "One ordering is my choice: blast → intent → title".

## Requirements traceability

| Req | Requirement (quoted or cited) | Source | Work items | Checked by |
|---|---|---|---|---|
| R1 | Inline marker `[NEEDS CLARIFICATION: <specific question>]` placed exactly where an assumption would go (AC, NFR, contract field, provenance row, edge case) | request item 1 | W1, W5, W7, W11 | W5, W7 `Done means`; W1 tests; W11 |
| R2 | No silent defaults: a default enters the spec only when the user explicitly accepted it; anything unanswered becomes a marker | request item 2.1 | W5, W11 | W5 `Done means`; W11 |
| R3 | At most 3 markers per spec; more → do not write the file, return to Pass 1 | request item 2.2 | W1, W2, W5 | W2 test "4 markers"; W5 `Done means` |
| R4 | Each marker mirrored in `Open questions` with an id (`OQ-N → AC-x`) | request item 2.3, Q4 | W1, W2, W5, W7 | W2 tests "unmirrored", "OQ-1 vs OQ-12"; W5 |
| R5 | A spec containing any marker cannot be `approved` (stays `draft`) | request item 2.4 | W1, W2, W5, W7, W11 | W2 tests "approved/implemented + marker"; W5; W11 |
| R6 | Final self-check counts markers and checks each is mirrored; the Pass 2 report states the count | request item 2.5 | W5, W11 | W5 `Done means`; W11 |
| R7 | "No silent decisions" tightened: a choice the user did not make is always a marker | request item 2.6 | W5 | W5 `Done means` |
| R8 | implementation-planner: a marker is a blocking open question; refuses to plan and returns the marker list | request item 3.1 | W6, W11 | W6 `Done means`; W11 |
| R9 | `specs/README.md` describes the marker; "no markers → may be approved" | request item 3.2 | W7 | W7 `Done means` |
| R10 | `docs/sdd-workflow.md`: one paragraph on how a marker travels through the pipeline | request item 3.3 | W8 | W8 `Done means` |
| R11 | `scripts/check-specs.mjs` fails when an `approved`/`implemented` spec contains a marker, reporting file:line | request item 4 | W1, W2 | W2 tests |
| R12 | Guard wired into existing checks; CI decided | request item 4, Q5, Q6 | W3, W4, W10 | W3, W4, W10 `Done means` |
| R13 | Guard ignores the marker's description in `specs/README.md` and example text | request item 4, Q7 | W1, W2 | W2 tests "README ignored", "fenced ignored" |
| Rec1 | Id inside the marker `[NEEDS CLARIFICATION: OQ-1 — <question>]`; script also checks ≤3 markers and mirroring in any status | accepted recommendation 1 | W1, W2, W5, W7 | W2 tests |
| Rec2 | `/implement` preflight runs the marker check on the plan's spec and stops on any marker | accepted recommendation 2 | W9 | W9 `Done means` |
| Rec4 | spec-creator: "a default in a brainstorm brief or researcher report is not a user decision" | accepted recommendation 4 | W5 | W5 `Done means` |
| Rec5 | One line in root `CLAUDE.md` under Commands/Checks | accepted recommendation 5 | W10 | W10 `Done means` |
| Q9 | Live smoke test: fresh spec-creator leaves a marker and keeps `draft`; planner refuses and lists it; nothing leaks into the commit | user answer to Q9 | W11 | W11 `Done means` |

## Clarifications and recommendations

- **Q1** Should Pass 1 questions still carry a default? → **default accepted:** keep it,
  renamed "proposed default". It applies only if the user accepts it; an unanswered
  question becomes a marker.
- **Q2** What is an unanswered question in Pass 2? → **default accepted:**
  - A Pass 1 question the brief neither answers nor accepts the default of becomes a
    marker, as long as the spec stays at ≤3 markers. Beyond that: no file, back to Pass 1.
  - A choice that first comes up while writing Pass 2 (the SPEC-03 AC-62 case) is treated
    the same way.
- **Q3** Do non-blocking open questions still exist? → **default accepted:** two kinds.
  - Marker mirrors `OQ-N → AC-x` block approval and count toward the cap.
  - Questions the user explicitly deferred, which block no criterion, carry no marker,
    do not block approval, and do not count toward the cap.
- **Q4** Id format → **default accepted:** `OQ-N`. It matches the existing usage at
  `specs/SPEC-03-pr-brief.md:1011` and avoids Pass 1 ids like `Q5` / `Q-F2`.
- **Q5** Wiring → **default accepted:** a `specs` pseudo-package in `scripts/verify.mjs`.
  `node scripts/check-specs.mjs` also stays runnable on its own.
- **Q6** CI → **default accepted:** new `.github/workflows/specs.yml`.
  - Triggers: `specs/**`, `scripts/check-specs*.mjs`, the workflow itself.
  - `permissions: contents: read`; Node 22; no install step.
- **Q7** Ignore rules → **default accepted:**
  - scan only top-level `specs/SPEC-*.md`;
  - skip fenced code blocks (```` ``` ```` and `~~~`);
  - inline code is still scanned, so a backticked marker counts.
- **Q8** Missing or unreadable `Status:` → **default accepted:** the script fails and
  names the file.
- **Q9** Verification of markdown changes → **answer:** grep-based `Done means` + fixture
  tests + `plan-verifier` **and** a live smoke test (W11).
- **Rec1** Id inside the marker; script checks cap and mirroring for every status →
  **accepted** (the user delegated the call to the caller).
- **Rec2** `/implement` preflight stops on any marker in the plan's spec → **accepted**.
- **Rec3** No change to `plan-verifier` → **accepted**.
- **Rec4** Leave other agents' default pattern; add the "not a user decision" line to
  spec-creator → **accepted**.
- **Rec5** One line in root `CLAUDE.md` Commands/Checks → **accepted**.

## Affected surface

| File | New/Mod | Package | Ring / home | Skills that will govern it | Constraint to respect |
|---|---|---|---|---|---|
| `scripts/check-specs.mjs` | New | repo root (no package) | root tooling script | security | No `child_process`, no dependency, read-only fs. A05 command injection and A03 supply chain (`.claude/skills/security/SKILL.md:67-71,104-106`) |
| `scripts/check-specs.test.mjs` | New | repo root | root tooling test | security (glob `scripts/*.mjs`, no `.mjs` test exclude — `.claude/skill-routing.md:12`) | `node:test` only. The CLI is spawned with `process.execPath` + an argv array, never `shell: true` (security A05) |
| `scripts/verify.mjs` | Mod | repo root | root tooling script | security | Keep the existing per-package contract and the usage line (`scripts/verify.mjs:7,21-33`). The `specs` branch runs only constant command strings |
| `.github/workflows/specs.yml` | New | CI | CI | security | Mirror `.github/workflows/mcp.yml:8-31`: path filter, `permissions: contents: read`, concurrency group |
| `.claude/agents/spec-creator.md` | Mod | agents | agent definition | — (unrouted) | Frontmatter lines 1–9 unchanged. The write scope (lines 33-42) stays `specs/` only |
| `.claude/agents/implementation-planner.md` | Mod | agents | agent definition | — (unrouted) | Keep the three Route A conditions (lines 110-116); the marker check is a fourth |
| `specs/README.md` | Mod | specs | process doc | — (unrouted) | Do not touch the `## Index` table (lines 117-124). It is spec-creator's, and the index rows must stay as they are |
| `docs/sdd-workflow.md` | Mod | docs | process doc | — (unrouted) | Exactly one paragraph (R10). The Mermaid diagram (lines 7-29) is left unchanged |
| `.claude/skills/implement/SKILL.md` | Mod | skills | skill | — (unrouted) | The orchestrator reads no source to judge it (`SKILL.md:10-14`). The check is one deterministic Bash grep, not a review |
| `CLAUDE.md` | Mod | root | project guide | — (unrouted) | One line inside `## Commands` (lines 41-49); nothing else changes |

**Coverage gaps:** every `.md` file above. `docs/**` and `**/*.md` are "unrouted by design"
(`.claude/skill-routing.md:22`). No skill reviews them; they are checked only by the grep
`Done means` below, `plan-verifier`, and the W11 smoke test.

## Contract changes

- **vendor/shared:** no.
- **Migration:** no.
- **Seed:** no.
- **Client build check needed:** no. No client file changes.
- **i18n:** no.
- **Marker grammar (internal contract between W1, W5, W6, W7, W9).** The exact literal
  every item uses:

  ```
  [NEEDS CLARIFICATION: OQ-<n> — <specific question>]
  ```

  - Prefix `[NEEDS CLARIFICATION:` is case-sensitive.
  - One space, then the id `OQ-` + digits, then a separator (`—`, `-` or `:`), then the
    question text, then `]`.
  - The mirror line under `## Open questions` is `OQ-<n> → <AC-/NFR-/EC- id(s)> — <question>`.
    It **never** repeats the bracketed marker literal.

  W1 defines the parser. Every doc item quotes this grammar verbatim, so the docs and the
  script cannot drift.

## Work items

### W1 — Write the marker guard `scripts/check-specs.mjs`
- **Serves:** R1, R3, R4, R5, R11, R13, Rec1, Q8.
- **Do:** create a zero-dependency ESM script (Node built-ins only: `node:fs`,
  `node:path`, `node:url`). Behaviour:
  - **CLI:** `node scripts/check-specs.mjs [--dir <path>]`.
    - Default dir: `<repo root>/specs`, resolved from `import.meta.dirname`.
    - Any other argument → usage on stderr, exit 2.
    - `--dir` that does not exist → error, exit 2.
  - **Files:** top-level entries of the dir matching `/^SPEC-\d+.*\.md$/`. Subdirectories
    and every other file (including `README.md`) are ignored.
  - **Fences:**
    - A line whose first non-space content (≤3 spaces of indent) is ```` ``` ```` or
      `~~~` opens a fence.
    - The fence closes on a line with the same character repeated at least as many
      times.
    - Lines inside a fence are not scanned for markers, the `Status:` line or the
      `## Open questions` heading.
    - Inline code spans are **not** skipped.
  - **Status:** the first line outside a fence matching `/^Status:\s*(\S+)/`.
    - The value must be `draft`, `approved` or `implemented`.
    - No such line, or another value → violation `<file>:<line or 1>: missing or
      unknown Status (<value>)`.
  - **Markers:** every occurrence of `[NEEDS CLARIFICATION` outside fences, with its
    1-based line number. An occurrence that does not match the grammar in *Contract
    changes* (no `OQ-<n>` id) → violation `marker without an OQ id`.
  - **Rules, each violation reported as `<path>:<line>: <message>`:**
    1. `approved` or `implemented` with ≥1 marker → one violation **per marker**:
       `marker in a <status> spec — resolve it or set Status: draft`.
    2. More than 3 marker occurrences in one spec, any status → one violation at the
       4th marker's line: `<n> markers (max 3)`.
    3. A marker id with no whole-word match (`\bOQ-<n>\b`, so `OQ-1` does not match
       `OQ-12`) inside the `## Open questions` section (from that heading to the next
       `## ` heading or EOF, outside fences) → `OQ-<n> is not mirrored under Open
       questions`.
  - **Output:** violations on stdout, then a summary line `check-specs: <S> spec(s),
    <M> marker(s), <V> violation(s)`. Paths relative to `process.cwd()`, with forward
    slashes.
  - **Exit codes:** 0 when V = 0, 1 when V > 0, 2 for usage or IO errors.
  - **Exports:** a pure `checkSpec(text, displayPath)` returning `{ status, markers:
    [{ line, id }], violations: [{ line, message }] }`, and `checkDir(dir)`. The CLI runs
    only when the file is the entry point (`import.meta.url ===
    pathToFileURL(process.argv[1]).href`), so the test can import it without side
    effects.
- **Files:** `scripts/check-specs.mjs`.
- **Done means:**
  - `node scripts/check-specs.mjs` from the repo root exits 0 on the current tree and
    prints `check-specs: 3 spec(s), 0 marker(s), 0 violation(s)`. SPEC-01..03 have no
    marker: `grep -rn "NEEDS CLARIFICATION" specs/` is empty today.
  - `grep -n "child_process" scripts/check-specs.mjs` is empty.
  - The file has no `import` from a non-`node:` specifier.
- **Verify:** `node scripts/check-specs.mjs` (repo root).
- **Rules that apply:** security → A05 Command Injection (no shell; nothing is spawned)
  and A03 Supply Chain (no dependency added).
- **Risk:** low. A wrong fence parser could hide a marker; W2's fence tests settle it.

### W2 — Fixture tests for the guard: `scripts/check-specs.test.mjs`
- **Serves:** R3, R4, R5, R11, R13, Rec1, Q8 (checks W1).
- **Do:** a `node:test` + `node:assert/strict` suite.
  - **Fixtures:** each `describe` writes its fixture specs into
    `fs.mkdtempSync(join(os.tmpdir(), "check-specs-"))`. They are removed in `after`
    with `rmSync(..., { recursive: true, force: true })`. No fixture file is committed.
  - **Pure-function cases (`checkSpec`):**
    - (a) `draft`, no marker → no violation.
    - (b) `approved`, no marker → none.
    - (c) `approved` + one mirrored marker on line N → exactly one violation at line N.
    - (d) `implemented` + marker → violation.
    - (e) `draft` with 3 mirrored markers → none.
    - (f) `draft` with 4 mirrored markers → cap violation.
    - (g) marker `OQ-2` with only `OQ-1` under Open questions → mirroring violation.
    - (h) marker `OQ-1` where Open questions only names `OQ-12` → mirroring violation.
    - (i) marker with no `OQ-` id → violation.
    - (j) marker inside a ```` ``` ```` fence and inside a `~~~` fence → ignored.
    - (k) marker inside inline backticks → counted.
    - (l) no `Status:` line, and `Status: aproved` → violation naming the file.
  - **CLI cases** (spawn `process.execPath` with `[scriptPath, "--dir", tmp]`, no shell):
    - (m) a dir holding a clean `SPEC-01-x.md` plus a `README.md` that contains a
      marker → exit 0;
    - (n) the same dir plus a nested `sub/SPEC-02-y.md` with a marker → still exit 0;
    - (o) an approved spec with a marker → exit 1, and stdout has a line ending
      `SPEC-..md:<N>: marker in a approved spec …` (assert on `:<N>:`);
    - (p) `--dir` pointing at a missing path → exit 2;
    - (q) no `--dir` (the real `specs/`) → exit 0. This is a regression guard for
      SPEC-01..03.
- **Files:** `scripts/check-specs.test.mjs`.
- **Done means:** `node --test scripts/check-specs.test.mjs` exits 0 and reports ≥17
  passing tests, one per case a–q. Temporarily inverting rule 1 in W1 makes (c), (d) and
  (o) fail (manual mutation check during the item, reverted before finishing).
- **Verify:** `node --test scripts/check-specs.test.mjs` (repo root).
- **Rules that apply:** security → A05 (spawn with an argv array, never `shell: true`).
- **Risk:** low. Path separators on Windows: assert with a regex on `:<line>:`, not on a
  full path.

### W3 — Add the `specs` pseudo-package to `scripts/verify.mjs`
- **Serves:** R12, Q5.
- **Do:**
  - Add `specs` to the accepted first argument and to the usage string (line 31) and the
    header comment (line 7).
  - For `specs`: `cwd` is the repo root, file arguments and flags are ignored, and the
    steps are exactly `["check-specs", "node scripts/check-specs.mjs"]` and
    `["check-specs tests", "node --test scripts/check-specs.test.mjs"]`. No typecheck and
    no arch step.
  - Reuse the existing step loop and PASS/FAIL printing (lines 70-92). The other four
    packages behave byte-for-byte as before.
- **Files:** `scripts/verify.mjs`.
- **Done means:**
  - `node scripts/verify.mjs specs` prints `PASS check-specs` and `PASS check-specs
    tests` and exits 0.
  - `node scripts/verify.mjs nope` exits 2 with a usage line that contains `specs`.
  - `node scripts/verify.mjs reviewer-core` still prints `PASS typecheck` and `PASS unit
    tests`, proving the existing path is intact.
- **Verify:** the three commands above, from the repo root.
- **Rules that apply:** security → A05: the `specs` commands are constants, no user
  input reaches `shell: true` (`scripts/verify.mjs:73-76`).
- **Risk:** low. Do not fold `specs` into `PKGS` in a way that makes `join(ROOT, pkg)`
  the cwd. `specs/` has no package.json.

### W4 — Add the CI workflow `.github/workflows/specs.yml`
- **Serves:** R12, Q6.
- **Do:** a workflow named `specs`, structured like `.github/workflows/mcp.yml`.
  - `on.push.branches: [main]` and `on.pull_request`, both with `paths:` `specs/**`,
    `scripts/check-specs.mjs`, `scripts/check-specs.test.mjs`,
    `.github/workflows/specs.yml`.
  - `permissions: contents: read`; concurrency `group: specs-${{ github.ref }}`,
    `cancel-in-progress: true`.
  - One job on `ubuntu-latest`: `actions/checkout@v4`, `actions/setup-node@v4` with
    `node-version: 22`, no install step, then `run: node scripts/check-specs.mjs` and
    `run: node --test scripts/check-specs.test.mjs`.
  - A header comment says what it guards and why there is no install step.
- **Files:** `.github/workflows/specs.yml`.
- **Done means:**
  - `grep -n "contents: read\|node-version: 22\|node scripts/check-specs.mjs\|node --test scripts/check-specs.test.mjs\|specs/\*\*" .github/workflows/specs.yml`
    returns all five.
  - There is no `pnpm`/`npm` step.
  - The PR for this branch shows the `specs` check green. That is observed at PR time
    and recorded in the PR, not by `plan-verifier`.
- **Verify:** the grep above. No local YAML linter exists (root `CLAUDE.md`: no linter).
- **Rules that apply:** security → least-privilege `permissions` (A02 misconfiguration).
- **Risk:** low.

### W5 — spec-creator: marker rules
- **Serves:** R1, R2, R3, R4, R5, R6, R7, Rec1, Rec4.
- **Do:** edit `.claude/agents/spec-creator.md` (frontmatter untouched):
  1. **Hard constraints → "Product decisions belong to the user"** (lines 56-58). Replace
     "Every such choice is a Pass 1 question with a default." with: every such choice is
     a Pass 1 question with a *proposed default* that applies only if the user explicitly
     accepts it; an unanswered one becomes a marker. Add the sentence (Rec4): *a default
     stated in a `brainstorm` brief or a `researcher` report is not a user decision.*
  2. **Lifecycle** (lines 75-77). `draft → approved` additionally requires zero markers,
     counted with `Grep -n "\[NEEDS CLARIFICATION"` on the file on disk. If any remain,
     refuse the flip and list each `OQ-N` with its `file:line`.
  3. **New section `## Unresolved points — the [NEEDS CLARIFICATION] marker`**, placed
     after `## The two-pass protocol`. It states:
     - the grammar from *Contract changes*, verbatim, with one inline example;
     - placement exactly where the assumption would go (AC, NFR, contract field,
       provenance row, edge case);
     - a mirror line `OQ-N → <ids> — <question>` under `Open questions`, without the
       marker literal;
     - **at most 3** marker occurrences per spec; more → no file, return to Pass 1 with
       the list;
     - any marker → `Status: draft`;
     - a marker is never placed inside a fenced code block, because the guard skips
       fences;
     - `node scripts/check-specs.mjs` (CI + `verify.mjs specs`) enforces this. You have
       no shell, so you count with Grep.
  4. **Pass 1** (line 200): "each with the default you would assume" → "each with a
     proposed default — it applies only if the user accepts it".
  5. **Pass 2 gate** (lines 205-209): write when every question is answered, its proposed
     default explicitly accepted, or (≤3 total) left unanswered → marker. More than 3 →
     no file, back to Pass 1. A choice that first comes up while writing Pass 2 is a
     marker too and counts toward the cap.
  6. **`Edge cases` bullet** (lines 252-254): the pointer may be `→ OQ-N`. **`Open
     questions` bullet** (lines 291-292) names the two kinds: marker mirrors (block
     approval, count toward the cap) and explicitly deferred non-blocking questions (no
     marker, block no AC, do not count).
  7. **Final self-check:** a new `**Markers**` block:
     - marker count from Grep reported;
     - ≤3;
     - every marker carries an `OQ-N` that has a mirror line under Open questions;
     - `Status: draft` when count > 0;
     - no marker inside a fence.

     The `Nothing the user did not decide appears as a requirement` line (329) gains "—
     each such point is a marker".
  8. **Pass 1 report template** (lines 349, 353, 358): `default: <what I assume if
     unanswered>` / `proposed default` → `proposed default: <…> (applies only if you
     accept it; unanswered → [NEEDS CLARIFICATION] marker)`.
  9. **Pass 2 report template** (lines 373-381): add the line `Markers: <N> (<OQ ids>) —
     spec stays draft until they are answered`. `Next:` becomes conditional: N > 0 →
     "answer OQ-… and re-dispatch spec-creator; implementation-planner will refuse this
     spec"; N = 0 → "implementation-planner with this path".
  10. **Quality bar → "No silent decisions"** (lines 394-395): "Anything the user did not
      decide is a Pass 1 question, a `[NEEDS CLARIFICATION]` marker, or an explicitly
      deferred non-blocking Open question — never a requirement, and never a choice you
      report as yours."
- **Files:** `.claude/agents/spec-creator.md`.
- **Done means** (all from the repo root):
  - `grep -c "NEEDS CLARIFICATION" .claude/agents/spec-creator.md` ≥ 6;
  - `grep -n "default: <what I assume if unanswered>" .claude/agents/spec-creator.md` is
    empty;
  - `grep -n "not a user decision" …` has 1 match;
  - `grep -n "OQ-N" …` has ≥ 3 matches;
  - `grep -n "^Markers: " …` has 1 match (Pass 2 template);
  - `grep -in "at most 3\|more than 3" …` matches;
  - `grep -n "\*\*Markers\*\*" …` has 1 match (self-check block);
  - `git diff -U0 .claude/agents/spec-creator.md` shows no hunk in lines 1-9.
- **Verify:** the grep commands above; `git diff --stat`.
- **Rules that apply:** none routed (coverage gap). The prompt-authoring rules in
  `docs/agent-prompts/` apply by convention.
- **Risk:** medium. Contradicting rules left behind (old "default accepted" wording in
  one place, new wording in another). Check by grepping for `default` in the file after
  editing and reconciling each hit.

### W6 — implementation-planner: a marker blocks the plan
- **Serves:** R8.
- **Do:** edit `.claude/agents/implementation-planner.md`:
  1. **Frontmatter `description`** (line 3): "no blocking open question" → "no blocking
     open question and no `[NEEDS CLARIFICATION]` marker".
  2. **Route A test** (lines 110-116): "meaning all three" → "all four". Add
     `4. it contains no [NEEDS CLARIFICATION: …] marker — any status, any section`.
  3. **Partial-failure paragraph** (lines 121-123): add that a marker is the exception.
     A spec with **any** marker is refused whole: no partial plan, and it does **not**
     fall through to Route B Q&A, because the open point belongs to `spec-creator` and
     the user.
  4. **"Route A — when the spec is not plannable"** (lines 143-151): add "any
     `[NEEDS CLARIFICATION]` marker" to the blocker list. Find them with `Grep -n
     "\[NEEDS CLARIFICATION" <spec>` and list every one.
  5. **"Route A, spec not plannable" output template** (lines 488-497): add a section
     `## Markers` with rows `1. OQ-N — specs/SPEC-NN-<slug>.md:<line> — "<question>"`,
     before `## Blockers`.
- **Files:** `.claude/agents/implementation-planner.md`.
- **Done means:**
  - `grep -c "NEEDS CLARIFICATION" .claude/agents/implementation-planner.md` ≥ 4;
  - `grep -n "all four" …` matches inside the Route A test;
  - `grep -n "^## Markers" …` has 1 match;
  - line 3 contains `NEEDS CLARIFICATION`;
  - the Route B Pass 1 template line `1. <question> — default: <what I assume if
    unanswered>` is unchanged (Rec4, out of scope).
- **Verify:** the grep commands above.
- **Rules that apply:** none routed (coverage gap).
- **Risk:** low.

### W7 — specs/README.md: describe the marker
- **Serves:** R1, R4, R5, R9, Rec1.
- **Do:**
  1. **Status lifecycle** (lines 22-28): add "A spec with any `[NEEDS CLARIFICATION]`
     marker stays `draft`; no markers → may be approved."
  2. **New section `## Unresolved points — [NEEDS CLARIFICATION]`** after `## Acceptance
     criteria — EARS`. It covers:
     - the grammar from *Contract changes*, with one example inside a fenced block;
     - placement;
     - the `OQ-N → …` mirror under `Open questions`;
     - the two kinds of Open questions (Q3);
     - the cap of 3 (more → spec-creator returns to Pass 1);
     - attribution: "GitHub Spec Kit convention, extended with an `OQ-N` id";
     - the guard `node scripts/check-specs.mjs` / `node scripts/verify.mjs specs` and
       what it fails on.
  3. Leave the template code block and the `## Index` table untouched.
- **Files:** `specs/README.md`.
- **Done means:**
  - `grep -n "no markers → may be approved\|no markers → may be approved" specs/README.md`
    matches;
  - `grep -n "^## Unresolved points" specs/README.md` has 1 match;
  - `grep -n "check-specs" specs/README.md` matches;
  - `git diff specs/README.md` shows no change inside the `## Index` table;
  - `node scripts/check-specs.mjs` still exits 0 (README is not scanned).
- **Verify:** the grep commands above, then `node scripts/check-specs.mjs`.
- **Rules that apply:** none routed (coverage gap).
- **Risk:** low.

### W8 — docs/sdd-workflow.md: how a marker travels
- **Serves:** R10.
- **Do:** add exactly one paragraph at the end of section `## 1. Spec — spec-creator, by
  hand` (after line 35). It follows the marker through the pipeline:
  - spec-creator writes it (≤3, mirrored `OQ-N`, spec stays `draft`, Pass 2 reports the
    count);
  - you answer, spec-creator revises the draft, markers reach 0, then you may approve;
  - `implementation-planner` refuses any spec with a marker and lists them;
  - `/implement` preflight stops on one;
  - `node scripts/verify.mjs specs` and the `specs` CI workflow fail an
    `approved`/`implemented` spec that still has one.
- **Files:** `docs/sdd-workflow.md`.
- **Done means:** `grep -c "NEEDS CLARIFICATION" docs/sdd-workflow.md` = 1 (one
  paragraph). The paragraph names `implementation-planner`, `/implement`, and
  `verify.mjs specs` (grep each). The Mermaid block is unchanged in `git diff`.
- **Verify:** the grep commands above.
- **Rules that apply:** none routed (coverage gap).
- **Risk:** low.

### W9 — `/implement` preflight stops on a marker
- **Serves:** Rec2.
- **Do:** in `.claude/skills/implement/SKILL.md` §0 Preflight, add a step after step 2.
  - When the plan's `Requirements source` names a `specs/SPEC-*.md`, run `grep -n
    "\[NEEDS CLARIFICATION" <that spec>` (Bash).
  - Any hit → **stop**, write nothing to the ledger beyond the step line, and tell the
    user: "`<spec>` has N unresolved markers (list `OQ-N` + `file:line`) — answer them,
    re-run `spec-creator`, then `implementation-planner`".
  - No hit → continue.
  - A note says the grep deliberately also counts a fenced marker: a false stop is
    cheaper than a missed one.
- **Files:** `.claude/skills/implement/SKILL.md`.
- **Done means:** `grep -n "NEEDS CLARIFICATION" .claude/skills/implement/SKILL.md`
  matches inside `## 0. Preflight` (its line number lies between that heading and `## 1.
  Implement`). The frontmatter (lines 1-6) is unchanged.
- **Verify:** the grep above; `git diff -U0` on lines 1-6.
- **Rules that apply:** none routed (coverage gap).
- **Risk:** low.

### W10 — Root CLAUDE.md: name the check
- **Serves:** Rec5, R12.
- **Do:** add one bullet under `## Commands` (after the `Checks` bullet, lines 45-48):
  "Specs guard: `node scripts/verify.mjs specs` (or `node scripts/check-specs.mjs`) when
  you touch `specs/` — fails an approved/implemented spec that still has a
  `[NEEDS CLARIFICATION]` marker, an unmirrored marker, or more than 3."
- **Files:** `CLAUDE.md`.
- **Done means:** `grep -n "verify.mjs specs" CLAUDE.md` has exactly 1 match, inside
  `## Commands` (line between 41 and the `## Map` heading). `git diff --stat CLAUDE.md`
  shows 1–2 lines added and 0 removed.
- **Verify:** the grep above; `git diff --stat CLAUDE.md`.
- **Rules that apply:** none routed (coverage gap).
- **Risk:** low.

### W11 — Live smoke test (main session, fresh chat, after W5–W10)
- **Serves:** Q9 (end-to-end confirmation of R1, R2, R5, R6, R8).
- **Executor:** **the main session, not `implementer`.** `implementer` has no `Agent`
  tool (`.claude/agents/implementer.md:4`). Run it in a **new chat** started after W5–W10
  are on disk, so the edited `spec-creator.md` / `implementation-planner.md` are the
  definitions that load.
- **Do:**
  1. **Snapshot.** Save `git status --porcelain > <scratchpad>/before.txt`. Copy
     `specs/README.md` to `<scratchpad>/README.before.md`.
     - Do **not** use `git checkout -- specs/README.md` for cleanup. W7's edits to that
       file are uncommitted at this point, and checkout would erase them.
  2. **spec-creator Pass 1.** Dispatch with a deliberately tiny throwaway request. For
     example: "Throwaway smoke test for the marker rule — a 'Copy PR link' button on the
     PR detail header; do not dispatch researchers."
  3. **spec-creator Pass 2.** Continue it (or re-dispatch with its Pass 1 report). Answer
     every question **except exactly one**, which is stated as "no answer — the user has
     not decided". Mark the brief as a user-authorised smoke test.
  4. **Check the spec** spec-creator wrote, `specs/SPEC-04-<slug>.md` (or the next
     number):
     - `grep -c "\[NEEDS CLARIFICATION: OQ-" <file>` is between 1 and 3;
     - `grep -n "^Status: draft" <file>` matches;
     - `grep -n "OQ-1 →" <file>` matches under `## Open questions`;
     - the Pass 2 report contains a `Markers:` line with the same count;
     - `node scripts/check-specs.mjs` exits 0. A draft with mirrored markers is legal,
       so this is a positive check of the guard on a real spec.
  5. **implementation-planner.** Dispatch on that spec path, with the brief "execution
     mode: single-agent, chosen by the user". It must reply `NO PLAN WRITTEN — spec needs
     revision`, with a `## Markers` section that lists the same `OQ-N` and
     `specs/SPEC-04-…md:<line>`. `git status --porcelain docs/plans/` must show no new
     file.
  6. **Cleanup.**
     - Delete the throwaway spec file.
     - Restore `specs/README.md` from `<scratchpad>/README.before.md`. That removes the
       index row spec-creator added.
     - Check that `git status --porcelain` equals `<scratchpad>/before.txt`, and
       `git diff specs/README.md` equals what W7 produced (no `SPEC-04` row:
       `grep -n "SPEC-04" specs/README.md` empty).
     - The spec number is free again, because the file was never committed.
  7. Record the observations from steps 4–6 (command + output, one line each) in the
     `/implement` ledger and quote them in the PR description.
- **Files:** none committed. Temporary: `specs/SPEC-<NN>-<slug>.md`, a `specs/README.md`
  index row, scratchpad copies.
- **Done means:**
  - the throwaway spec held 1–3 `[NEEDS CLARIFICATION: OQ-…]` markers, each mirrored,
    with `Status: draft`;
  - spec-creator's Pass 2 report stated the count;
  - implementation-planner returned `NO PLAN WRITTEN` listing every marker with
    `file:line` and wrote no file;
  - after cleanup, `git status --porcelain` equals the pre-test snapshot and
    `grep -rn "SPEC-04" specs/` is empty.
- **Verify:** the commands in steps 4–6, recorded verbatim.
- **Rules that apply:** `docs/git-workflow.md`: nothing from this item is committed.
- **Risk:** medium.
  - Agent definitions may be cached by an older session. Mitigation: a new chat.
  - Cleanup could erase W7's work. Mitigation: restore from the snapshot, never `git
    checkout`.
  - Cost: two opus runs (spec-creator twice, planner once). The user accepted this in Q9.

## Execution

| Phase | Executor | Work items | Files (disjoint) | Depends on | Parallel with | Isolation |
|---|---|---|---|---|---|---|
| P1 — guard | implementer | W1, W2, W3, W4 | `scripts/check-specs.mjs`, `scripts/check-specs.test.mjs`, `scripts/verify.mjs`, `.github/workflows/specs.yml` | — | — | shared tree |
| P2 — agent and process docs | implementer | W5, W6, W7, W8, W9, W10 | `.claude/agents/spec-creator.md`, `.claude/agents/implementation-planner.md`, `specs/README.md`, `docs/sdd-workflow.md`, `.claude/skills/implement/SKILL.md`, `CLAUDE.md` | P1 (the docs name its command and grammar) | — | shared tree |
| P3 — smoke test | main session, new chat | W11 | none committed (temporary spec + index row, restored) | P2, and `/implement`'s review loop finished | — | shared tree; snapshot/restore per W11 |

- **P2 is six items, one over the 3–5 guideline.** All six are small single-file markdown
  edits, and the user chose two implementer phases.
- Each implementer is dispatched with this plan's path **and its phase id** and touches
  only its phase's files.
- **Integration:** run by the main session after P2. It runs the full Verification plan
  below. Cross-phase check: `grep -rn "\[NEEDS CLARIFICATION: OQ-" .claude specs/README.md
  docs/sdd-workflow.md` shows the same grammar as `scripts/check-specs.mjs`'s parser.
- `plan-verifier` settles W1–W10. W11 is settled by its recorded observations, because it
  runs after `/implement` finishes.

## Verification plan

| Command | Directory | Manager | Passing means |
|---|---|---|---|
| `node scripts/verify.mjs specs` | repo root | — | `PASS check-specs` + `PASS check-specs tests`, exit 0 |
| `node scripts/check-specs.mjs` | repo root | — | `check-specs: 3 spec(s), 0 marker(s), 0 violation(s)`, exit 0 |
| `node --test scripts/check-specs.test.mjs` | repo root | — | all cases a–q pass |
| `node scripts/verify.mjs nope` | repo root | — | exit 2, usage lists `specs` |
| `node scripts/verify.mjs reviewer-core` | repo root | — | existing package path unchanged: typecheck + unit tests PASS |
| grep `Done means` of W5–W10 | repo root | — | every grep as stated in its item |
| W11 steps 4–6 | repo root (new chat) | — | as stated in W11 `Done means` |
| `specs` workflow on the PR | GitHub | — | green check |

No server, client, or DB suite is needed: no package source changes.

## Assumptions

- **Exit codes:** 1 for every spec-content violation, including a missing or unknown
  `Status:` (so CI has one failure code); 2 only for usage or IO errors. This refines the
  Pass 1 note, which put an unreadable status under 2.
- **The cap counts marker occurrences, not distinct ids.** "At most 3 markers per spec"
  is read literally. One question that affects two places uses two of the three.
- **Mirror lines never repeat the marker literal.** The script does not special-case the
  `## Open questions` section when counting, so a literal in a mirror would double the
  count.
- **The guard scans only top-level `specs/SPEC-*.md`.** Legacy `<pkg>/specs/L0N-*.md` are
  read-only history (root `CLAUDE.md` Naming → Specs) and are not scanned.
- **`/implement` preflight uses a plain grep on the one spec** (not `check-specs.mjs`).
  The script passes a legal draft with markers, but `/implement` must stop on any marker.
- **spec-creator counts markers with the Grep tool.** It has no Bash
  (`.claude/agents/spec-creator.md:4`), so it cannot run the script; the script backs it
  up in CI and in `verify.mjs specs`.
- **Agent definition edits take effect only in sessions started after them.** Hence W11
  runs in a new chat.
- **Root `package-lock.json` exists without a root `package.json`.** It is not touched;
  the script needs no package.

## Open questions

None.

## Research used

None. Every conclusion cites a file in this repo. The Spec Kit attribution of the marker
syntax is the user's, as stated in the request.

## Rollback / blast radius

Reverting the 10 committed files restores the previous behaviour completely. There is no
migration, no seed, and no runtime code. The new CI workflow disappears with its file.
W11 leaves nothing behind by construction (snapshot/restore). If a W11 cleanup step is
missed, `git status` before commit shows an untracked `specs/SPEC-0N-*.md` and a
`specs/README.md` diff containing a `SPEC-0N` index row. Remove both as in W11 step 6.
