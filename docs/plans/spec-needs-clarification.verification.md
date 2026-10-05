# Verification report — [NEEDS CLARIFICATION] marker

Plan: `docs/plans/spec-needs-clarification.plan.md` · 2026-10-05 · branch `feat/spec-needs-clarification`.

## Verdict

**All 11 work items done; R1–R13, Rec1/2/4/5 and Q9 verified.**
- `plan-verifier` checked W1–W10 and verified every one.
- The main session ran W11, the live smoke test, and recorded the evidence below.

## Checks
| Command | Result |
|---|---|
| `node scripts/verify.mjs specs` | PASS check-specs · PASS check-specs tests (17/17) |
| `node scripts/check-specs.mjs` | `3 spec(s), 0 marker(s), 0 violation(s)`, exit 0 |
| `node scripts/verify.mjs reviewer-core` | PASS (regression check of `verify.mjs`) |
| `node scripts/verify.mjs nope` | exit 2, usage lists `specs` |
| `security-reviewer` on the scripts and the workflow | no CRITICAL or WARNING; 2 optional suggestions (see below) |

## W11 — live smoke test (main session)
1. **spec-creator, Pass 1.** A fresh dispatch on a throwaway request ("Copy brief" button, SPEC-04).
   - It applied the new rules: questions carried a *proposed* default and named the cap of 3.
   - It warned that 4 unanswered questions would exceed the cap and send it back to Pass 1 with no file written.
2. **spec-creator, Pass 2.** Q1, Q3 and Q4 were answered. **Q2 was left unanswered on purpose**: not deferred, default not accepted. Result:
   - `Status: draft`;
   - `Markers: 2` stated in the report;
   - self-check 19/19, including the new Markers block.
   - **OQ-1** sits on AC-13, exactly where Q2's answer would have gone.
   - **OQ-2** sits on AC-8. It is a choice that first came up while writing, which the rules also turn into a marker instead of a decision.
   - Both markers are mirrored under `## Open questions`.
3. **Guard on that spec:**
   - As a draft: `4 spec(s), 2 marker(s), 0 violation(s)`, exit 0.
   - The same file with `Status: approved`, in a temp dir: `…:87` and `…:113` reported as markers in an approved spec, `2 violation(s)`, exit 1.
4. **implementation-planner on SPEC-04:**
   - It returned `NO PLAN WRITTEN — spec needs revision`.
   - It listed both markers with `file:line` and explained why AC-8 and AC-13 cannot be checked as written.
   - It wrote no file and did not fall through to a Route B Q&A.
5. **Cleanup:** SPEC-04 deleted and `specs/README.md` restored from a saved copy.
   - `git status --porcelain` matches the pre-test snapshot.
   - `grep -rn "SPEC-04" specs/` is empty.
   - The guard is back to `3 spec(s), 0 marker(s)`.

## Change after verification
- The guard message `marker in a approved spec` now reads `marker in a spec with Status: <status>` (grammar). The three tests that assert it were updated; still 17/17.

## Open items / suggestions not applied
- `security-reviewer`, optional:
  - add `persist-credentials: false` to the checkout step;
  - pin actions by commit SHA. The repo's other six workflows use `@v4` too, so this is a separate, repo-wide change.
- `plan-verifier`, not run by it:
  - the W2 manual mutation check: run by the implementer instead (rule 1 disabled → 4 tests failed, then reverted);
  - the PR-time green `specs` CI check.
- A `SPEC-*.md` that is a symlink is skipped by the guard (`Dirent.isFile()`). This is harmless, because a PR author could edit the script anyway.
