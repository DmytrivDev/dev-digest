---
name: pr-self-review
description: "Reviews all open local changes before a Pull Request is opened: collects the full diff (committed on the branch + staged + unstaged + untracked), routes each changed file to the domain skills that govern it, fans those out as parallel read-only review subagents, runs the deterministic checks (typecheck, arch:check, vendor lock-step, migrations, lockfiles), and returns a BLOCKED or PASS verdict. Use before any git push or Pull Request, and on \"self review\", \"review my changes\", \"check my changes before the PR\", \"am I ready to open a PR\", or when /pr-self-review is invoked. At least one CRITICAL finding blocks: the PR is not opened until it is fixed or explicitly waived."
metadata:
  version: 1.0.0
---

# PR self-review

Answers one question: **is this change safe to open a PR for?**

This repo has no linter, no `arch:check` CI job and no PR template. Its skills encode real
rules, but they only fire when an agent happens to load them —
`frontend-ui-architecture` says so itself: *"Structure rules here are not linted … so they
hold only by review and habit."* This skill turns that habit into a procedure.

It is **report-only**. There is no hook and no `settings.json` change; nothing physically
prevents a push. The gate is a verdict you and the agent honour. That is a deliberate
choice — see [README.md](README.md).

## Run it

```bash
node .claude/skills/pr-self-review/scripts/collect-diff.mjs
```

Then follow the five phases below in order. Phases 1, 2 and 5 are scripts; 3 and 4 are
yours.

---

## Phase 1 — collect

`scripts/collect-diff.mjs` writes `.devdigest/cache/pr-self-review/plan.json` plus one
patch per reviewer under `diffs/`. Read the plan; do not re-derive the diff yourself.

Scope is `git merge-base origin/main HEAD` against the **working tree** — committed on the
branch, staged, unstaged and untracked, all of it. `origin` is the fork. Never diff or
target `upstream/main`: per `docs/git-workflow.md` you cannot merge there, and a wrong PR
base is not recoverable by editing the PR afterwards.

Exit 2 means collection failed. It prints `{"error":…,"hint":…}` — report the hint and
stop at **INCOMPLETE**. Do not proceed on a partial plan.

If `plan.warnings` mentions a stale base, pass the `git fetch origin main` suggestion on.
The script never fetches by itself: a review that silently does network I/O is a surprise,
and a fetch failing offline would turn a code gate into an infrastructure gate.

## Phase 2 — deterministic checks

**Run these before the fan-out.** If a typecheck fails, **skip the fan-out entirely** and
report `BLOCKED at phase 2 — domain review not run`. Findings about code that does not
compile are unreliable, and skipping saves the whole subagent budget on the most common
failure.

Run only what `plan.packages_touched` lists. Commands per package, and which block, are in
[checks.md](checks.md). Record each result in
`.devdigest/cache/pr-self-review/checks.json`:

```json
{ "checks": [
  { "id": "server:typecheck", "label": "server · pnpm typecheck",
    "blocking": true, "status": "pass", "detail": "0 errors" }
] }
```

`status` is `pass` · `fail` · `skipped` · `unavailable` · `error`. `error` means the
command could not run at all and forces **INCOMPLETE**.

Three traps that will otherwise produce false blockers:

- **`arch:check` may not exist.** It is not in the committed `server/package.json` and
  `server/.dependency-cruiser.cjs` is untracked. Probe for both; if either is missing
  record `unavailable`, never `fail`. It also needs **no baseline**: `--output-type err`
  exits non-zero only on `error`-severity rules, and every current violation is `warn`.
- **A `TS2307` cascade in the server means `reviewer-core` has no deps**, not that the
  change broke types. `server/tsconfig` aliases `../reviewer-core/src`, which imports
  `openai`/`zod`; they are sibling directories, so `server/node_modules` is never reached.
  Fix is `cd reviewer-core && npm ci` — npm, not pnpm.
- **Tests never block**, and the failures in [baseline.json](baseline.json) are known-bad
  on any clean Windows checkout. Report them as `known-failing (Windows, unrelated)`.

## Phase 3 — fan-out

For each non-deferred entry in `plan.routes`, dispatch one `pr-reviewer` subagent, filling
the template in [reviewer-prompt.md](reviewer-prompt.md). **Send them all in a single
message** so they run concurrently.

The subagent has `Read`, `Grep` and `Glob` only — no Bash, no Write. It reviews a working
tree the developer is still editing, and a reviewer that can write is a reviewer that can
corrupt what it is judging. That is why phase 1 pre-cuts the patches.

**If `pr-reviewer` is not an available agent type**, you are in the session that created
it: `.claude/agents/*.md` is read at session start, so a newly added agent registers only
on the next one. Fall back to `Explore` (read-only) and paste the standing rules from
`.claude/agents/pr-reviewer.md` — severity, verdict, findings discipline, grounding,
output shape — into the prompt, since a generic agent does not carry them. Say in the
report that the fallback was used.

Save each reply's JSON block to `.devdigest/cache/pr-self-review/findings/<skill>.json`.
Unparseable? Ask once for the JSON block alone; still unparseable ⇒ **INCOMPLETE**, naming
the skill. A review that did not happen is not a review that found nothing.

Deferred routes are real coverage gaps. They are named in the report; do not present a
deferred skill as having passed.

## Phase 4 — merge

`scripts/gate.mjs` does this. It drops findings that cite an unassigned file, land outside
a changed region, or use an out-of-enum severity/category — into a visible
`## Dropped findings` table, never into silence. It downgrades a CRITICAL below 0.7
confidence to WARNING, and dedupes on file + overlapping lines + category, recording every
skill that raised the survivor.

## Phase 5 — gate

```bash
node .claude/skills/pr-self-review/scripts/gate.mjs
```

Writes `latest.md`, a timestamped copy and `verdict.json`. Exit 0 = PASS, 1 = not PASS.

The verdict mirrors `gateTriggered(findings, 'critical')` from
`reviewer-core/src/output/to-review.ts`: **BLOCKED iff at least one CRITICAL survives**.
That is the product's own shipped default (`ci_fail_on: 'critical'`), not a stricter bar
invented here. Score uses the `reduce.ts` formula — 100 − 35·C − 12·W − 3·S — so a
self-review score is comparable to a product review score.

**Three states, not two:**

| | Meaning |
|---|---|
| **PASS** | zero CRITICAL and every planned phase ran |
| **BLOCKED** | ≥1 CRITICAL |
| **INCOMPLETE** | a phase could not run — bad base ref, a check that errored, a reviewer whose JSON never parsed |

INCOMPLETE triggers the same refusals as BLOCKED but is labelled separately, so the user
knows it is infrastructure rather than their code. This deliberately inverts
`.claude/hooks/insights-stop.mjs`'s *"never block on infrastructure failure"*: that hook
must not wedge a session, whereas this gate must not pass a review it never performed.

---

## What BLOCKED means

While the verdict is BLOCKED or INCOMPLETE, **refuse** to:

- run `git push`;
- draft a PR title or body, or give PR-opening steps;
- open the GitHub compare URL in a browser (`gh` is not installed here, so that URL is the
  actual path to opening a PR);
- describe the branch as ready, or advise merging.

**Still allowed, and say so** — the gate is a checkpoint, not a wall: reading, editing,
fixing, and `git commit`. Committing is not merging.

Report in chat: the verdict line, the blocker count, each blocker as one line with
`file:line`, and the report path. Then: *"fix these and re-run `/pr-self-review`, or tell
me which blocker you are waiving and why."*

**Waivers live in chat only.** Quote the user's words in a `## Waivers` section of the next
report. Never write a waiver file — a persisted waiver is how a gate quietly dies.

## Staleness

`verdict.json` records `head_sha` and `dirty_hash`. Before honouring a PASS — before any
push or PR action — recompute both:

```bash
git rev-parse HEAD && git status --porcelain
```

A mismatch means *"that PASS was for a different tree — re-run `/pr-self-review`."*
Without this check a PASS from three edits ago waves a broken change through, which is the
single most likely way this gate silently stops working.

## Known suppressions

Do not report these as new findings. Each is already tracked elsewhere:

- **`onion-architecture` §5 known debt** — `routes.ts` querying Drizzle in `pulls`,
  `polling`, `settings`, `workspace`; `service.ts` taking the whole `Container` in `repos`,
  `reviews`, `agents`, `repo-intel`; `repo-intel/service.ts` importing concrete adapters.
  The rule is *new code does not do this; existing code migrates when you are already
  touching it* — so flag it only when this diff **adds** to the pattern.
- **`arch:check`'s 20 warnings** — all in untouched modules, and `warn` does not affect the
  exit code.
- **The 6 `server/test/indexer-pipeline.test.ts` failures** — a path-splitting bug in the
  test's own `writeFileAt` helper, failing on any clean Windows checkout.

## Adding a skill to the routing

Edit [routing.json](routing.json) — it is the source of truth, and
[routing.md](routing.md) explains the reasoning. Every catalog skill appears there exactly
once: `routed: true` with globs, or `routed: false` with a reason. Omission is
indistinguishable from an oversight, which is why phase 5 raises a WARNING for any new
`SKILL.md` with no routing entry.
