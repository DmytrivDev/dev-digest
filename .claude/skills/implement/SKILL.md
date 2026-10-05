---
name: implement
description: "Runs the implementation half of Spec Driven Development from a finished plan: implementer (lanes or phases) → integration checks → plan-verifier → architecture review with fix iterations until clean → final verification. Takes a plan path from docs/plans/, plus optional notes and design/screenshot paths. Spec (spec-creator) and plan (implementation-planner) are made manually beforehand; this command never writes either. Never commits. Use only when invoked as /implement."
argument-hint: "<docs/plans/slug.plan.md> [notes…] [design or screenshot paths…]"
disable-model-invocation: true
---

# /implement — plan → working, reviewed code

You are the **orchestrator**. You dispatch agents, run the cheap deterministic checks, keep a
ledger, and talk to the user. You do **not** write production code, read source files to
judge them, or review anything yourself — every judgement comes from an agent report. That
keeps this session's context small: it lives through the whole run, and every call re-reads
it. Full picture: `docs/sdd-workflow.md`.

```
preflight → implement → integrate → verify #1 ⟲ fix → review ⟲ fix ⟲ re-review → verify #2 → report
```

Input: `$ARGUMENTS`

## 0. Preflight (no agent)

1. **Parse the arguments.** The `*.plan.md` path is the plan. Existing files with an image
   extension or under `docs/design/` are **designs**. Everything else is **notes**.
   - A `specs/SPEC-*.md` instead of a plan: find the plan whose `Requirements source` cites
     it (`Grep` in `docs/plans/`). None → stop: "run `implementation-planner` on this spec
     first".
   - No plan at all → list `docs/plans/*.plan.md`, newest first, and ask which.
2. **Read only what you orchestrate by:** the plan's header, `Execution`, `Contract
   changes`, the work-item ids and titles (`Grep -n "^### W\|^## "` then targeted `Read`s).
   Leave the design sections for the implementers.
3. **Spec marker check.** When the plan's `Requirements source` names a `specs/SPEC-*.md`,
   run `grep -n "\[NEEDS CLARIFICATION" <that spec>` (Bash). Any hit → **stop**, write
   nothing to the ledger beyond the step line, and tell the user: "`<spec>` has N
   unresolved markers (list `OQ-N` + `file:line`) — answer them, re-run `spec-creator`,
   then `implementation-planner`". No hit → continue. The grep deliberately also counts a
   fenced marker: a false stop is cheaper than a missed one.
4. **Notes are context, not scope.** A note that adds behaviour the plan does not have is a
   plan change: stop and ask — re-run `implementation-planner`, or drop the note. A note that
   constrains *how* ("reuse the Drawer from kit/", "keep the old endpoint") is passed on.
5. **Branch.** On `main` → warn: `docs/git-workflow.md` wants a `feat/<slug>` branch per
   homework. Ask whether to create it (`git switch -c feat/<slug>`); never commit.
6. **Ledger** — `.devdigest/cache/implement/<slug>.md` (gitignored). If it exists, ask:
   resume from its last completed step, or start over. Otherwise create it:

   ```markdown
   # /implement ledger — <slug>
   Plan: docs/plans/<slug>.plan.md · Started: <date> · Branch: <name>
   Notes: <…> · Designs: <paths or none>
   ## Steps        (one line per completed step: step — result)
   ## Changed files (union of every implementer report)
   ## Findings
   | ID | Round | Source | Sev | file:line | Summary | Decision | Status |
   ```

   Update it after every step. After a context reset, it is how you resume.

## 1. Implement

Follow the plan's `Execution` table exactly:

- **Lanes** whose `Depends on` are satisfied → one `implementer` each, **all in one message**
  so they run in parallel. Dependent lanes start after their dependencies report.
- **Phases** (single-agent plan split into runs) → one `implementer` at a time, in order.
- **No table** (small single-agent plan) → one `implementer` for the whole plan.

Each brief carries only: the plan path; the lane/phase id; the notes; the design paths if the
lane touches `client/`; "you are not the integration pass". Never paste the plan into the
brief.

From each report record in the ledger: status, `Files changed`, `Deviations`, `BLOCKED`
items. **Structural `BLOCKED`** (the plan is wrong) → stop and put it to the user: fix the
plan with `implementation-planner`, or accept the implementer's proposed deviation. Don't
improvise a design.

## 2. Integrate (no agent)

For every package in the ledger's changed files: `node scripts/verify.mjs <pkg>` — the full
unit suite, typecheck and arch:check. Plus `pnpm build | tail -30` in `client/` when the
plan's `Contract changes` says a client file gains a value import (only if `pnpm dev` is not
running). Plus `node scripts/verify.mjs server --it` when the plan touches DB code and
Docker is up.

Red → `implementer` in **fix mode** with the failure lines as findings. Max 2 rounds, then
stop and show the user the failure.

## 3. Verify #1 — is everything built?

`plan-verifier` with the plan path and the latest `verify.mjs` output ("use this, don't
re-run the suite"). Rows `not verified` / `partially verified`, and `Plan items with no
corresponding change` → `implementer` fix mode with exactly those rows. Then `plan-verifier`
again in **re-check mode**: only the item ids that were fixed, plus its previous verdict
table to carry over. Max 2 rounds → then stop and ask the user.

`unverifiable` rows are a plan defect, not a code defect — record them for the final report;
don't loop on them.

## 4. Review ⟲ fix — the iteration loop (max 3 rounds)

**Round 1 — review.** In one message:
- `architecture-reviewer` with the ledger's changed files (scope: change);
- `security-reviewer` too, if any changed file is routed to `security` in
  `.claude/skill-routing.md` (routes, services, adapters, config, prompts, `api.ts`,
  `package.json`, `mcp/src`).

**Triage** (you, no agent) — give every finding an id `F<n>` and a decision in the ledger:

| Finding | Default decision |
|---|---|
| CRITICAL, WARNING | **fix** |
| SUGGESTION | **skip** — listed in the final report |
| Contradicts the plan or spec, or needs a design change | **ask the user** |
| Same as a finding already dismissed in this run | **skip** |

Batch the "ask" ones into one `AskUserQuestion` (fix / skip / change the plan). The user can
always override any default — show the triage table before fixing when there are more than
five fixes.

**Fix.** `implementer` in fix mode with the findings to fix — id, `file:line`, rule, failure
scenario, suggestion; nothing else from the review. Findings in disjoint packages → one
implementer per package, in parallel. Per finding it returns `fixed`, `blocked` or
**`disputed`** (with evidence that the finding is wrong). Disputed → show both sides to the
user; they decide fix or dismiss. After the fixes: `node scripts/verify.mjs <pkg> <files the
fix touched>`; red → back to the same implementer once.

**Re-review (rounds 2–3).** The same reviewer(s), in **re-review mode**: the previous round's
open findings (id + summary + `file:line`) and only the files the fixes touched. It returns
each old finding as `resolved` / `still open`, plus new findings **only in the lines the fix
changed**. A reviewer that had no fix-worthy findings last round is not re-run.

**Stop when:** no finding with decision `fix` is still open → leave the loop. **Escalate to
the user when:** round 3 ends with open findings; or the same finding reopens after being
marked fixed (the fix and the review disagree — a person has to decide). Report the open
ones with options: another round, accept as is, or change the plan.

## 5. Verify #2 — final verdict

Skip only if nothing changed since verify #1. Otherwise:
1. `node scripts/verify.mjs <pkg>` for each touched package — the final full sweep.
2. `plan-verifier` in re-check mode for the items whose files the fixes touched, with its
   verify #1 table to carry over — it returns the final per-item and **per-requirement**
   tables.

## 6. Report to the user

```markdown
## /implement — <slug>: DONE | DONE WITH OPEN ITEMS | STOPPED at <step>

| Step | Result |
|---|---|
| Implement | <N lanes/phases> — <statuses> |
| Integrate | verify.mjs <pkgs>: <pass/fail>; client build: <pass | not needed> |
| Plan verification | <VERIFIED | …> — <n>/<m> items, <k>/<j> ACs |
| Review | <rounds> rounds · <fixed> fixed · <skipped> skipped · <open> open |

**Open items:** <findings still open, unverifiable criteria, deviations — or "none">
**Suggestions skipped:** <F-ids, one line each — or "none">
**Changed files:** <count> — ledger: `.devdigest/cache/implement/<slug>.md`

Next: review the diff → `docs/git-workflow.md` → commit/PR → re-dispatch `spec-creator` with
the per-requirement table to mark the spec `implemented` → `/engineering-insights`.
```

## Rules for the whole run

- **Never commit, push or open a PR**, and never edit the spec or the plan.
- **Pass paths, not content.** Briefs carry file paths and the specific rows an agent needs
  — never a whole report or the plan text.
- **One agent per job**: implementer writes, reviewers review, plan-verifier verifies. You
  don't fix a one-liner yourself "to save a round" — it would skip verification of it.
- **Test-writer is off** in this pipeline for now (token budget). Tests come from the plan's
  work items via `implementer`.
- A user answer that changes scope mid-run → stop; the plan is out of date.
