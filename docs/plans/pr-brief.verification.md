# Verification report — PR Brief (SPEC-03)

Final `plan-verifier` run, 2026-10-04.
Plan: `docs/plans/pr-brief.plan.md` · Requirements: `specs/SPEC-03-pr-brief.md` (AC-1…AC-102, NFR-1…NFR-4).

## Verdict

**22 of 23 work items and 106 of 106 requirements verified** after the main session closed AC-100 (see below).
The one item not fully green is **W22/W23**: the plan's gate is "the full e2e suite passes", and flow 08 fails there.
Flow 08 is a pre-existing flow, not part of this plan. Flow 09, this feature's own flow, passes.

Evidence base:
- `node scripts/verify.mjs server`: 863 unit tests, typecheck, `arch:check` at 20 warnings / 0 errors (unchanged baseline).
- `node scripts/verify.mjs server --it`: 21 files, 220 tests, **0 skipped**.
- `node scripts/verify.mjs client`: 77 files, 630 tests.
- e2e flow 09 alone: 15/15.
- Manual browser checks, listed below.
- `plan-verifier` read the plan, the spec, the code and the tests itself. It ran no state-changing commands.

### Closed after the run (main session)
- **AC-100 (paginated PR files).** On the dev DB, PR #9 (`DmytrivDev/dev-digest`) stores **378 `pr_files` rows for `files_count` 378**. Before the change it stored 100.
  - Checked with: `select pr.files_count, count(f.*) … where pr.number=9`.

## Per work item

| Item | Done means (lead clause) | Verdict |
|---|---|---|
| W1 | both vendor-shared-sync tests pass; sample parses in both; diff empty | verified |
| W2 | hunk ranges, linked-issue parsing, control chars, blast states, six inputs | verified |
| W3 | tiers cut in order; never refuse; cuts recorded | verified (7 tiers, AC-62 amendment) |
| W4 | untrusted rule in the system prompt; escaping; constant labels; no hunk body | verified |
| W5 | every Verify example of AC-71, AC-73…82 and AC-97 passes | verified |
| W6 | error mapping; rate window; byte-exact log line; `isStale` | verified |
| W7 | repository: typecheck clean, no row types exported, IT coverage | verified; deviation: `enabledAgentDocs` lives in `ProjectContextRepository` (review fix F1) |
| W8 | service imports no container or adapters; one model call; IT passes | verified; deviation: specs read via `readFileBytes` + `decodeDoc` (review fix F11) |
| W9 | routes registered, no new arch violation | verified |
| W10 | both IT files pass, 0 skipped | verified |
| W11 | `GET /pulls/:id` persists the live `head_sha`; the offline path does not | verified |
| W12 | seeded brief for #482; idempotent seed | verified |
| W13 | hooks: one POST, 3 s poll, `quietError` | verified |
| W14 | `brief.json` valid, reworded keys | verified |
| W15 | diff focus: open, accent border, scroll and highlight | verified |
| W16 | `?tab=diff&file=&line=` in both orders | verified |
| W17 | `VerdictBanner` additive props | verified |
| W18 | `BriefBanner`: all states and helpers | verified |
| W19 | `BriefFileRef`, `RiskAreas`, `RiskPill` | verified |
| W20 | `ReviewFocusCard` | verified |
| W21 | Overview composition | verified (stacked layout, per the AC-1/AC-2 amendment) |
| W22 | `./scripts/e2e.sh` passes flows 01–09 | **partial**: flow 09 alone 15/15; full suite 7/9 (see Open items) |
| W23 | every command passes, 0 skipped, manual checks observed | **partial**: the full e2e run is not green; client `pnpm build` not run (not required, no value import) |

## Per requirement

Every AC and NFR is **verified**, either by unit or integration tests or by the manual checks below. Notes:

| Requirement | Evidence note |
|---|---|
| AC-1, AC-2 | stacked layout: `OverviewTab.test.tsx`, plus a manual check at desktop width |
| AC-18, AC-85, AC-94 | `prompt_tokens` (amendment A-1): `helpers.test.ts`, `brief.it.test.ts`, `brief-outcome.test.ts` |
| AC-31 | unit tests, plus e2e flow 09 |
| AC-36 | manual: PR #5 `server/package.json:26`, PR #9 `simple-git.ts:20` |
| AC-61, AC-62 | real cl100k count in `brief-generation.it.test.ts`; 40-row floor and tier 7 in `brief-budget.test.ts` (amendment A-2) |
| AC-100 | `octokit.paginate`; dev DB check 378/378 (amendment A-3) |
| AC-101 | `brief.system.md` rule; `brief-prompt.test.ts` (amendment A-4) |
| AC-102 | `DiffTab.test.tsx`, `helpers.brief.test.ts`; manual: PR #9 marks and counters on all 9 named files (amendment A-5) |
| NFR-1 | Enter keydown cases plus native-button checks (no `user-event` in the repo) |

The full per-requirement table (AC-1…AC-102, NFR-1…NFR-4, with work items) is in the `plan-verifier` output this report summarises. Every row reads `verified`, except AC-100, which read `partial` before the DB check above.

## Changes with no plan item

User-authorized amendments, each verified:
- **A-1:** `prompt_tokens` (AC-18, AC-85, AC-94).
- **A-2:** 40-row floor and tier 7 (AC-62).
- **A-3:** paginated PR files (AC-100).
- **A-4:** prompt rule (AC-101).
- **A-5:** diff marks, whole-file anchoring and file-header counters (AC-102).
- **A-6:** stacked layout (AC-1, AC-2).

Review hardening, no plan item:
- the tokenizer counts special tokens as plain text (`encode(text, [], [])`);
- linear `ISSUE_REF_RE`;
- byte caps, run-breaking and `chunkMemoCounter`;
- `normalizeKind`;
- extra cost and security tests.

## Contract answers

- **vendor/shared:** both `contracts/brief.ts` copies changed and are identical.
- **Migration:** none for this feature.
- **Seed:** `SEED_PR_482_BRIEF` is inserted with `onConflictDoNothing()`.
- **Client build:** not required, since this feature adds no value import from `@devdigest/shared`.

## Open items

1. **Full e2e suite 7/9 on Windows.** Flow 08 (Onboarding Tour, pre-existing, not in this plan) fails on a cold Next compile slower than agent-browser's 25 s timeout. Its unfinished compile also breaks the next flow's first `open`. Flow 09 passes alone.
2. **AC-102 sub-clauses** are covered by code paths and manual checks, not by dedicated unit tests:
   - "Hide notes" also hides brief notes;
   - a finding on the same row keeps the stripe and label;
   - a file with no patch gets an unanchored note.
