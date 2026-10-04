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
