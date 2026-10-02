# Retro: SPEC-01 Project Context (spec-creator, two passes + follow-up) — 2026-10-02
Session: `c8721d64-29b4-4897-99e7-81bf65252df8` · Window: 2026-10-02T09:55:00Z → 10:43:00Z (UTC)
Collected with `.claude/skills/workflow-retro/scripts/collect-run.mjs`.

## Summary
- **Outcome.** `specs/SPEC-01-project-context.md` was written (draft): 6 US / 75 AC / 26 EC / 5 NFR, and the self-check passed.
- **Cost.** 12.33M tokens in total, of which 878.5k were fresh (input + cache write + output). There were 4 agents (main + 3 subagents) and 47m29s of wall time, most of it spent waiting for the user's answers.
- **Most expensive problem.** Both `researcher` runs finished their work, but their reports never reached `spec-creator`. That is 2.77M tokens (245k fresh, **28% of the run's fresh tokens**) whose results were not used. Facts they had already established were then re-derived by `spec-creator` and by main. Several were never recovered, and they matter to SPEC-01 (see *Missed / lost*).

## Run at a glance

| Subagents | API calls | Fresh tokens | Cache read | Output | Total | Wall |
|---|---|---|---|---|---|---|
| 3 | 116 | 878.5k | 11.45M | 86.7k | 12.33M | 47m29s |

| # | Agent | Parent | Depth | Mode | Start | End | Wall | Resumes |
|---|---|---|---|---|---|---|---|---|
| 1 | main (opus-5.5) | — | 0 | — | 09:55:29 | 10:42:58 | 47m29s | — |
| 2 | spec-creator (opus-5.5) | main | 1 | foreground | 09:56:14 | 10:42:46 | 46m32s | 2 |
| 3 | researcher "Prompt assembly and run trace" (sonnet-5.5) | spec-creator | 2 | **background** | 09:56:39 | 09:58:25 | 1m46s | 0 |
| 4 | researcher "Repo file access and indexing" (sonnet-5.5) | spec-creator | 2 | **background** | 09:56:39 | 09:58:49 | 2m09s | 0 |

| Agent | API calls | Fresh | Cache read | Peak context | Tool calls | Errors |
|---|---|---|---|---|---|---|
| main | 28 | 116.3k | 3.19M | 138.8k | 23 | 0 |
| spec-creator | 53 | 517.0k | 5.74M | 190.1k | 89 | 0 |
| researcher (prompt) | 16 | 110.8k | 1.01M | 103.7k | 51 | 0 |
| researcher (repo) | 19 | 134.4k | 1.52M | 124.2k | 73 | 0 |

spec-creator's active time was short: pass 1 took 3m55s (09:56:14–10:00:09), pass 2 took 6m49s (10:12:10–10:18:59) and the follow-up took 53s (10:41:52–10:42:45). The other ~35 minutes of wall time were the user answering.

## Per agent

### spec-creator — good spec, but pass 1 was built without the research it had paid for
- **Hard.**
  - At 09:58:13 the harness forced a hand-back (`[handback-send-enforce]`): the agent had ended its turn to wait for its two background researchers.
  - It then handed back at 10:00:09, saying neither researcher "had returned". They had in fact finished at 09:58:25 and 09:58:49, but the notices never reached it.
  - Pass 1 therefore listed facts it could not establish (local clone? ref of `readFile`? does repo-intel index md?) as open questions.
- **Easy.**
  - Pass 2 and the follow-up were efficient: 6m49s and 53s.
  - The main brief pre-listed the INSIGHTS entries, screenshots and the extracted mock, so pass 2 had no research to do.
  - The follow-up brief (925 chars) named exactly which IDs to touch.
- **Duplicated.** Pass 2 re-derived, by its own reads, facts already in the lost reports:
  - `readFile` takes no ref;
  - `TraceBody.tsx` already renders `specs` and `specs_read`;
  - the `ceil(chars/4)` / tiktoken tokenizer.

  Shared reads: `reviewer-core/src/prompt.ts`, `contracts/trace.ts`, `adapters/tokenizer/index.ts`, `client/src/lib/skills.ts`, `simple-git.ts`, `vendor/shared/adapters.ts`, `db/schema/{repos,context}.ts`, `intent/helpers.ts`.
- **Missed / lost.** Facts present in the researcher reports and absent from SPEC-01. Each was verified by grep on 2026-10-02.
  1. `repos.default_branch` is never written from GitHub. The only writes are the schema default `'main'` (`server/src/db/schema/repos.ts:15`) and the seed (`server/src/db/seed.ts:99`). AC-50 and AC-74 reason about "the repository's default branch". For a repo whose real default is not `main`, the stored value is wrong, and the AC-74 log line would compare against it.
  2. Client scaffolding for this feature already exists:
     - `useContextFiles` / `useReindexContext` call `GET /repos/:id/context` (`client/src/lib/hooks/core.ts:122-137`);
     - `client/messages/en/context.json` (with the `.devdigest/specs/` empty state);
     - contracts `SpecFile` / `IndexStatus` (`server/src/vendor/shared/contracts/platform.ts:254-269`).

     SPEC-01 names none of them, so a planner may build parallel ones.
  3. In map-reduce mode, the persisted `prompt_assembly` is a whole-diff assembly that differs from each per-file call (`reviewer-core/src/review/run.ts:145-146,177`). "The full text that was added to the request" is therefore only exact for single-pass.
- **Brief.**
  - The brief was solid: 5.1k chars, with the exact asks and the design sources.
  - One defect is the caller's. It quoted `server/INSIGHTS.md` L98 ("link changes don't bump agent version") as live. The repo researcher found it stale: `applySkillChange` bumps `agents.version` and snapshots it (`server/src/modules/agents/repository.ts:281-300`). That report was lost, so the stale framing reached the Pass 1 questions (Q14).

### researcher "Repo file access and indexing" — correct and complete, lost
- **Hard.**
  - Its largest single read was 61.5k chars, the size of `server/INSIGHTS.md` (62.8 KB); this is inferred from the size.
  - Its route grep failed on glob syntax, and it said so honestly.
- **Easy.**
  - It answered every one of its numbered asks with `file:line` evidence in 2m09s.
  - It flagged two stale INSIGHTS entries (L21: `run_skills` now exists, `server/src/db/schema/runs.ts:81`; L98: see above).
- **Duplicated.**
  - It read the whole `server/INSIGHTS.md`, which main and spec-creator had both read.
  - It re-read `simple-git.ts` and `adapters.ts`, which spec-creator read as well.
- **Missed / lost.** The whole report was lost (`result-not-delivered`). Main later re-derived its central fact — the local clone and `readFile` reading the working tree — with its own Grep and Bash calls to settle Q6.
- **Brief.** Good: one concrete question, a scope, and an output shape. It quoted the L22 claim to confirm or refute, and that pointer was used well.

### researcher "Prompt assembly and run trace" — correct and complete, lost
- **Hard.** Nothing notable: no errors, 16 calls.
- **Easy.** It answered all 5 asks in 1m46s, including the slot order, the `wrapUntrusted` label escaping gap, the persistence path, the client rendering and the token helpers.
- **Duplicated.** `prompt.ts`, `trace.ts` and the tokenizer were read again by spec-creator in pass 2.
- **Missed / lost.** The whole report was lost (`result-not-delivered`), including the map-reduce assembly caveat and the unused `platform/trace-builder.ts`.
- **Brief.** Good. It asked for "Not established" explicitly, and got it.

### main (orchestrator)
- **Hard.**
  - It did not notice that the researchers' completion notices had been queued to *main*: a `queue-operation` at 09:58:25.
  - It took spec-creator's "had not returned" at face value. Recovering the two reports from the transcripts would have cost two file reads and no tokens of new research.
- **Duplicated.**
  - It re-read INSIGHTS files several times: `server/INSIGHTS.md` ×4 and `client/INSIGHTS.md` ×4. Part of that is the per-prompt protocol hook, and part is the insights capture.
  - It re-derived the clone fact itself.
- **Human-in-the-loop.**
  - There were 2 `AskUserQuestion` rounds with 8 questions, plus one free-text acceptance.
  - The answers changed the outcome materially: view-only page, no token budget, screenshot tab order, "simplest implementation", no version bumps. Asking was worth it.

## Workflow findings
- **Order and parallelism.** spec-creator correctly sent both research questions in one message, so they ran in parallel. But they ran as *background* dispatches from a depth-1 agent. Their completion notices were queued to the main session, not to their parent. The parent ended its turn to wait, was forced to hand back, and never saw them.
- **Waste.** 2.77M total / 245k fresh tokens on unused research, which is 28% of fresh tokens. On top of that came the re-derivation reads in spec-creator pass 2 and in main.
- **Rework.** Two resumes of spec-creator. Both were planned — answers, then the open-question decisions — not caused by errors.
- **Stale knowledge.** Two `server/INSIGHTS.md` entries (L21, L98) no longer match the code. One was passed on in a brief as current.

## Proposed changes

| # | Change | File | Why (evidence) | Expected effect |
|---|---|---|---|---|
| 1 | **APPLIED.** Researchers are dispatched with `run_in_background: false` (still parallel when sent in one message). | `.claude/agents/spec-creator.md` §"Delegating research" | The two `result-not-delivered` findings plus `handback-enforced` at 09:58:13 | No lost research; spec Pass 1 is built on established facts. |
| 2 | Same rule for the planner's researcher dispatches. | `.claude/agents/implementation-planner.md:250-254` ("How to dispatch well") | Same dispatch pattern; same depth-1 parent | Prevents the same loss in planning. |
| 3 | Feed SPEC-01 the three lost facts: (a) `default_branch` is never synced from GitHub; (b) the existing `useContextFiles` / `context.json` / `SpecFile` / `IndexStatus` scaffolding; (c) the map-reduce assembly caveat. Decide whether AC-50 and AC-74 should use the clone's actual HEAD branch instead of `repos.default_branch`. | `specs/SPEC-01-project-context.md` (via `spec-creator`) | *Missed / lost* above | The spec matches the code before approval, and the planner does not build duplicates. |
| 4 | Supersede the stale entries L21 (`run_skills` exists) and L98 (link changes do bump the version). | `server/INSIGHTS.md` (via `engineering-insights`) | `server/src/db/schema/runs.ts:81`, `server/src/modules/agents/repository.ts:281-300` | Briefs stop propagating stale facts. |
| 5 | When a subagent reports that its research "did not return", recover the reports from `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl` (`/workflow-retro` writes them to `handbacks/`) before re-researching or asking the user. | orchestrator habit / `docs/sdd-workflow.md` | Both reports were sitting on disk at 09:58 | Paid-for work is used. |
| 6 | Researcher briefs quote the 2–3 INSIGHTS entries they need instead of letting the researcher read the 62 KB file. | caller habit (`spec-creator`, `implementation-planner` briefs) | A 61.5k-char Read in the repo researcher (inferred: `server/INSIGHTS.md`) | ≈15k fewer tokens per researcher. |

## Measured vs inferred
- **Measured from the transcripts:**
  - all token, call, time, mode and resume figures;
  - the `result-not-delivered` and `handback-enforced` findings;
  - the shared-read lists;
  - the `queue-operation` delivery of both notices to main at 09:58:25 and 09:58:49.
- **Verified in code on 2026-10-02:**
  - `default_branch` writes;
  - `applySkillChange` version bump;
  - the `run_skills` table;
  - `readFile` taking no ref;
  - SPEC-01 not mentioning the client scaffolding.
- **Inferred:**
  - that the 61.5k-char read was `server/INSIGHTS.md` (matched by size);
  - that spec-creator ended its turn *in order to wait* (the forced hand-back says only that it ended its turn without reporting);
  - the "≈15k tokens" saving in change 6.
