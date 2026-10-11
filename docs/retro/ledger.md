# Workflow retro ledger

Append-only log of `/workflow-retro` runs — one `##` entry per reviewed workflow, newest at
the bottom. Written ONLY through `.claude/skills/workflow-retro/scripts/append-ledger.mjs`;
never edit or reorder past entries. A later entry may supersede an earlier one by saying so.

## 2026-10-02 — SPEC-01 Project Context, spec-creator (2 passes + follow-up)
Source: deep (session `c8721d64-29b4-4897-99e7-81bf65252df8`, 09:55Z → 10:43Z) · Outcome: `specs/SPEC-01-project-context.md` written (draft); 6 US / 75 AC / 26 EC / 5 NFR. Full one-off report: `docs/retros/2026-10-02-spec-01-project-context.md` (made before this ledger existed).

| Agents | Order | Tokens | Duration | Resumes | User questions |
|---|---|---|---|---|---|
| 3 + main | main → spec-creator → (researcher ∥ researcher, background) | 12.33M total; 878.5k fresh / 11.45M cache read | 47m29s (spec-creator active ≈12m) | 2 (planned) | 2 rounds, 8 questions + 1 free-text |

**Per agent**
- `spec-creator` — Hard: forced hand-back at 09:58:13 after ending its turn to wait for background researchers; pass 1 then listed researched facts as open questions. · Easy: pass 2 (6m49s) and follow-up (53s), because the briefs were precise. · Duplicated: re-derived `readFile` has no ref, the trace rendering and the tokenizer — all present in the lost reports. · Missed/lost: see Module insights. · Brief: good; one stale fact passed as current by main (server INSIGHTS L98).
- `researcher` ×2 — Hard: none notable. · Easy: all numbered asks answered with `file:line` in under 2m10s. · Duplicated: one read the whole `server/INSIGHTS.md` (61.5k chars). · Missed/lost: **both reports lost** (`result-not-delivered`). · Brief: good — one concrete question, a scope and an output shape each.

**Findings**
- The background researchers' completion notices were queued to the MAIN session instead of to their parent. That is 2.77M tokens (245k fresh, 28% of fresh) of unused research.
- The main orchestrator accepted "research did not return" without recovering the reports, which were on disk at 09:58.
- Asking the user was worth it: the answers changed scope materially (view-only, no token budget, screenshot tab order).

**Proposals**

| # | Proposal | Target | Evidence | Expected effect | Status |
|---|---|---|---|---|---|
| 1 | Dispatch researchers with `run_in_background: false` | `.claude/agents/spec-creator.md` § Delegating research | 2× result-not-delivered + forced hand-back | no lost research | applied |
| 2 | The same rule for the planner | `.claude/agents/implementation-planner.md:250-254` | same dispatch pattern | prevents the same loss | proposed (deferred by user) |
| 3 | Feed the three lost facts into the spec | `specs/SPEC-01-project-context.md` | Module insights below | spec matches code | proposed (deferred by user: future specs) |
| 4 | Recover hand-backs from transcripts before re-researching | orchestration habit | reports on disk at 09:58 | paid-for work used | proposed |
| 5 | Researcher briefs quote the 2–3 INSIGHTS entries they need | brief habit | 61.5k-char INSIGHTS read | ≈15k tokens/researcher | proposed |

**Module insights**
- **server**
  - `repos.default_branch` is never synced from GitHub — it is always `'main'` (`server/src/db/schema/repos.ts:15`, `server/src/db/seed.ts:99`). `resyncRepo` syncs to it (`server/src/modules/repo-intel/service.ts:160`).
  - `GitClient.readFile` takes no ref: it reads the clone's working tree (`server/src/adapters/git/simple-git.ts:135-145`).
  - Skill-link changes DO bump `agents.version` (`server/src/modules/agents/repository.ts:281-300`), so INSIGHTS L98 is stale.
  - `run_skills` exists (`server/src/db/schema/runs.ts:81`), so INSIGHTS L21 is stale.
- **client**
  - Project-context scaffolding already exists: `useContextFiles` / `useReindexContext` (`client/src/lib/hooks/core.ts:122-137`) and `client/messages/en/context.json`. SPEC-01 does not mention either.
  - The trace drawer already renders `specs_read` and `prompt_assembly.specs` (`TraceBody.tsx:43-55,91-93`).
- **reviewer-core** — in map-reduce mode, the persisted `prompt_assembly` is a whole-diff assembly that differs from each per-file prompt (`reviewer-core/src/review/run.ts:145-146,177`).

## 2026-10-11 — SPEC-08 Multi-Agent Review: spec-creator → implementation-planner → 3 implementer lanes → reviews → fix → manual check
Source: in-context (scope: spec → plan → implementation → verification; the later user-feedback items rev. 3 / W20 are excluded) · Outcome: SPEC-08 (49 ACs) implemented and committed as `b17b4bd`. `--it` 359/359, client 989/989, server 1065/1065. Manual M1–M8 passed after 2 runtime defects were fixed by the caller.

| Agents | Order | Tokens | Duration | Resumes | User questions |
|---|---|---|---|---|---|
| 9 dispatches (spec-creator, implementation-planner, implementer ×4, architecture-reviewer, security-reviewer, plan-verifier) | spec-creator ×3 segments → planner ×3 → L1 → L2 ∥ L3 → arch ∥ security → plan-verifier → fix ×1 → caller manual browser check | 2,327,453 subagent tokens, the sum of `<usage>`: spec 697,020 · planner 870,228 · implementers 496,995 · reviewers 263,210 | ~70 min of subagent time (sum of `duration_ms`); wall time not visible | 4 (spec-creator 2, planner 2) | 5 rounds: spec Q1–Q11 + P1–P9; simplify; security-review option A/B; MINOR fixes; key and stack |

**Per agent**
- `spec-creator`. Three segments, numbers per notification:
  - pass 1: 183,666 tokens · 78 tools · 523 s;
  - pass 2 (folded in a mid-run drawer requirement): 240,504 · 25 · 446 s;
  - simplify rewrite: 272,850 · 9 · 249 s.

  Hard: pass 1 produced 112 criteria. It had no shell, so the caller ran `check-specs` both times. Easy: the pass-1 research found the real blockers early: the sequential executor (`run-executor.ts:139-166`), the unlinked `multi_agent_runs`, and that "did not flag" reasons have no data source. That saved the planner from discovering them. Duplicated: the third segment rewrote the whole spec down to 49 criteria. Missed/lost: nothing asked was dropped, but some Verify levels said "unit" where the executor needs a DB; the planner logged 3 spec follow-ups. Brief: never asked for a scope or complexity budget, so the "keep it simple" turn came after a 112-criterion spec and cost a full rewrite (272,850 tokens).
- `implementation-planner`. Three segments:
  - first: 258,974 · 56 tools · 563 s, ended at the 50-turn limit with NO plan file;
  - resume "write now": 290,498 · 58 · 827 s, as reported; whether these figures are cumulative is not visible;
  - rev. 2 (no tests, fix-loop cap): 320,756 · 2 · 228 s.

  Hard: it spent its whole turn budget researching. In rev. 2 it reports "no Edit tool", so it rewrote a 651-line plan with one `Write` for a few targeted changes. Easy: once told to stop researching, it wrote a coherent 3-lane plan with disjoint file sets that held through execution. Duplicated: re-researched facts the spec already cited (executor loop, `findingMatches`, tenancy). Missed/lost: segment 1's output was lost entirely. Brief: the caller asked it to "verify them, cite them" with no turn budget, which invited the research spiral. Three INSIGHTS line numbers in the brief were off by one (caller error, flagged by the planner).
- `implementer` L1: 101,934 · 27 · 236 s. Clean. Easy: the brief carried the measured baseline (1065/989) and exact rules. Nothing missed.
- `implementer` L2 (server): 154,041 · 47 · 438 s. Settled both "to confirm" items with a throwaway `app.inject` script that it then deleted. Reported the orphan-parent risk unprompted.
- `implementer` L3 (client): 172,959 · 49 · 437 s. Reported its deviations (dropdown width, extra i18n keys) and the `?pr=` cross-repo gap, which became a real defect in the manual check.
- `architecture-reviewer`: 38,212 · 15 · 32 s. Cheapest pass; 0 CRITICAL/MAJOR, 2 MINOR. The brief that pre-supplied the arch:check result kept it focused.
- `security-reviewer`: 92,798 · 32 · 182 s. Found the only MAJOR (`agent_ids` had no `.max()`). It was worth adding once tests were dropped (option B).
- `plan-verifier`: 132,200 · 28 · 172 s. Marked every PV row PASS and caught the AC-14 400-vs-422 edge, later confirmed by a probe. Missed: it rated the drawer criteria (AC-37–39) PASS by reading the code, yet the browser check found that the trace never loaded after a polled `done` (status written at `run-executor.ts:298` before the trace at `:362`).
- `implementer` fix iteration 1: 68,061 · 20 · 269 s. Confirmed AC-14 with a probe before fixing it (400 → 422). Everything delivered.

**Findings**
- **Planning was the most expensive phase:** 870,228 tokens, 37% of the subagent total. Its first 258,974-token segment produced nothing.
- **The spec was rework-heavy:** 112 → 49 criteria after the user asked for simplicity. Together, segment 3 and the 104-AC detail work were about 40% of the spec spend.
- **The lanes parallelised well.** L2 ∥ L3 had disjoint file sets with zero conflicts, and both finished in ~437 s. arch ∥ security ran in parallel too.
- **Dropping tests (rev. 2) moved defect detection to the manual browser check.** That check found 2 real defects that typecheck, the suites, the reviewers and plan-verifier all passed:
  - the trace drawer cached a 404 after a polled `done`;
  - Configure run used the wrong active repo off `/repos/:id` routes.

  The caller fixed both outside the fix loop, so no reviewer saw those edits.
- **The shared dev DB produced a false failure.** Another API's boot reaper flipped a running child to `failed` mid-measurement. That nearly read as a broken failure isolation.
- **The fix-loop cap held:** 1 of the 2 allowed fix dispatches was used. The caller made the 1-line MAJOR fix itself instead of dispatching.

**Proposals**
| # | Proposal | Target | Evidence | Expected effect | Status |
|---|---|---|---|---|---|
| 1 | Write the plan file within the first ~15 tool calls, research only to fill gaps, and hand back a partial plan rather than hit the turn limit. | `.claude/agents/implementation-planner.md` § Spec-driven route | segment 1: 56 tools, 258,974 tokens, no file | avoids a wasted segment (~259k tokens) and a forced resume | proposed |
| 2 | Give implementation-planner the `Edit` tool. | `.claude/agents/implementation-planner.md` frontmatter `tools` | rev. 2: "I have no Edit tool"; a full 651-line rewrite for targeted changes | smaller, safer plan revisions | proposed |
| 3 | Ask a scope question first in pass 1 (minimal vs full; target AC count), before the gap list. | `.claude/agents/spec-creator.md` § Pass 1 | 112 → 49 rewrite, 272,850 tokens | removes a full spec rewrite | proposed |
| 4 | Pass the spec's Research/Design-review facts (file:line) to the planner explicitly, and say "do not re-verify these". | brief / orchestration habit | planner re-researched the executor loop, `findingMatches` and tenancy | fewer planner reads | proposed |
| 5 | Rate runtime-timing criteria (polling vs SSE, data written after a status flip, storage/route fallbacks) "pending browser" rather than PASS-by-reading. | `.claude/agents/plan-verifier.md` | AC-37–39 PASS by reading; the browser found the trace 404 race | verdicts that do not overstate | proposed |
| 6 | When tests are dropped, run the browser smoke (M-checks) BEFORE the reviewers, so its defects enter the capped fix loop and get reviewed. | brief / orchestration habit; plan template § Verification order | 2 defects fixed by the caller outside the loop, unreviewed | the same budget, with all fixes reviewed | proposed |
| 7 | Give a worktree's dev stack its own database (or document one API per DB) for measurements. | `scripts/` / `docs/` (dev setup) | the boot reaper flipped a child to failed during M6 (verification record) | trustworthy manual measurements | proposed |
| 8 | Give spec-creator a narrow shell, or the `check-specs` command, to self-check. | `.claude/agents/spec-creator.md` frontmatter `tools` | the caller ran `check-specs` after both writes | one fewer caller round per spec | proposed |

**Module insights** (all verified in code; each also appended to the package INSIGHTS.md during the session)
- **server**
  - `executeRuns` was sequential before SPEC-08 (`server/src/modules/reviews/run-executor.ts:139`, now `Promise.all`).
  - The run is marked `done` before the trace is saved (`run-executor.ts:298` vs `:362`).
  - The boot reaper fails every `running` row DB-wide (`server/src/modules/reviews/repository/run.repo.ts:155`).
  - An empty JSON body gets Fastify's 400 before Zod (`server/src/modules/multi-agent/routes.ts`, the encapsulated parser).
- **client**
  - Off `/repos/:id` routes, the active repo falls back to localStorage, then to the first repo (`client/src/lib/repo-context.tsx:48`).
  - `useRunEvents` starts with `running=false`, so the drawer's first render fetches a trace (`client/src/lib/hooks/reviews.ts:211`).

**Not visible** (in-context only): the nested researcher the spec-creator used in pass 1; the main session's own tokens; fresh vs cached split; files read by several agents; whether the planner's resume figures are cumulative.
