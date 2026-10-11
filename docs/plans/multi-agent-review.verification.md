# Verification record: Multi-Agent Review (SPEC-08)

Manual verification for `docs/plans/multi-agent-review.plan.md` (W15). It records the M1–M8 browser checks and the NFR-4 measurement of one agent against three.

- **Date:** 2026-10-10.
- **Stack:** this worktree's own dev servers. The API ran on `:3101` and the web app on `:3100`, against the shared dev Postgres on `:5433`, with migration `0023` applied.
- **PR:** `DmytrivDev/dev-digest` #5 ("feat(pulls): search the PR list by title"). It has 6 files and +61 −0 lines, and real diff text.
- **Model:** every agent ran on `openrouter` · `deepseek/deepseek-v4-flash`.

## NFR-4: 1 agent vs 3 agents (actual numbers)

The single agent (Security Reviewer) is also one of the three. Values come from `GET /multi-agent-runs/:id`, which reads the persisted run rows and traces.

| | 1-agent run `dbb26f37` | 3-agent run `32e037f0` |
|---|---|---|
| Agents | Security | General, Performance, Security |
| Wall-clock (`total_duration_ms`) | 26,996 ms | 257,373 ms |
| Total cost | $0.00124838 | $0.00929169 |
| Tokens in (sum) | 5,123 | 21,007 (10,560 + 5,324 + 5,123) |
| Tokens out (sum) | 1,897 | 38,124 (34,628 + 1,184 + 2,312) |
| Findings kept / grounding | 0 (0/0 passed) | 2 (General 1/1, Performance 0/0, Security 1/1) |
| Groups / conflicts | 0 / 0 | 1 / 1 (`server/src/modules/pulls/search.ts:12`) |

Per agent in the 3-agent run:

| Agent | Duration | Cost | Tokens in → out | Findings | Score |
|---|---|---|---|---|---|
| General Reviewer | 257,346 ms | $0.00729175 | 10,560 → 34,628 | 1 | 65 |
| Performance Reviewer | 15,041 ms | $0.00063536 | 5,324 → 1,184 | 0 | 100 |
| Security Reviewer | 28,700 ms | $0.00136458 | 5,123 → 2,312 | 1 | 88 |

Ratios for 3 agents over 1:

| Measure | Ratio |
|---|---|
| Wall-clock | 9.53× |
| Cost | 7.44× |
| Tokens in | 4.10× |
| Tokens out | 20.1× |

These are not 3×, and the reason is the work itself, not the fan-out:

- **The agents ran in parallel.** The 3-agent wall-clock (257.4 s) equals its slowest child (General, 257.3 s), while the children's durations sum to 301.1 s. The same agent, Security, took 27.0 s alone and 28.7 s alongside two others (1.06×), so concurrency added almost no time.
- **One agent dominated.** General Reviewer produced 34,628 output tokens, 91% of all output, and that took 257 s. This matches the reasoning-heavy upstream behaviour recorded in `server/INSIGHTS.md` (2026-10-02, OpenRouter upstream reasoning billed against `max_tokens`). It is the main driver of both the time ratio and the cost ratio.
- **Response length varies between runs.** Security received exactly the same prompt in both runs (5,123 tokens in), yet answered with 1,897 tokens the first time and 2,312 the second.
- **The diff was prepared once.** Each child's log contains exactly one "Loading PR diff…" line.

## NFR-3: concurrency ratio

The target is that a 3-agent run takes less than 1.5× a 1-agent run.

- **Not met as written: the measured ratio is 9.53×.** NFR-3 assumes every agent takes the same time, as with the stub in the spec. Real agents differ: here one took 257 s and another 15 s.
- **The property NFR-3 is meant to show does hold.** Total time equals the longest child, not the sum, and the same agent ran 1.06× slower in parallel than alone. A stub-based test, deferred per plan rev. 2, would check the stated ratio.

## M1–M8

| Check | Result | Evidence |
|---|---|---|
| M1 PR-page picker | PASS | The dropdown shows: <ul><li>the merged warning, "Pick agents to run", Clear;</li><li>5 checked enabled agents with `~Ns` hints;</li><li>`—` for the agent with no history;</li><li>`Run multi-agent review (N)`, whose count tracks the checkboxes;</li><li>"Configure agents…".</li></ul>A run sends one POST and lands on `/multi-agent/<id>`. |
| M2 Configure run | PASS, after a fix (see below) | `?pr=` preselects PR #5. Each of the 5 cards shows its description and `avg time · avg cost`. With 3 checked, the footer reads `≈ 63.0s · $0.0081 · parallel fan-out`: the maximum of 63.0, 19.9 and 47.5 s, and the sum $0.0043 + $0.0014 + $0.0024. A double click on Run sent exactly one POST. |
| M3 Results, 3 agents | PASS | All three columns were `running` at the same moment. Each showed `Running · Ns` while running. While the run was going, `GET /multi-agent-runs/:id` repeated every ~3 s, and it stopped once the run was done. The meta row reads `3 agents · parallel · 257.4s total · $0.0093`. |
| M4 Tabs and disagreements | PASS | <ul><li>Tabs show the scores 65, 100 and 88, with `role=tab` and `aria-pressed` on the mode control.</li><li>`FindingCard` shows Accept and Reject; Learn is disabled with the title "Not available yet".</li><li>The group at `search.ts:12` lists General (CRITICAL) and Security (WARNING), each with its own original title, and Performance as "did not flag". It is a conflict.</li><li>A 1-agent run shows "Disagreements need at least two finished agents."</li></ul>Accept was not clicked, so finding triage in the shared DB stays unchanged. |
| M5 Trace drawer | PASS, after a fix (see below) | <ul><li>View trace on a running column opens the dialog `Agent run · Security Reviewer` with `PR #5 · running`. It is visible in the viewport and streams Live log lines.</li><li>`?trace=` is set on open and removed on close.</li><li>After completion the trace tab shows Configuration, Stats (grounding 1/1, 28.7 s, 5k→2.3k tokens, $0.0014, 1 finding), Prompt assembly, Tool calls, Raw output, Findings, Skills used and Copy raw output.</li><li>The log has 24 lines, with exactly one "Loading PR diff…".</li></ul> |
| M6 Forced failure | PASS | A temporary agent with the model `nonexistent/model-for-failure-test` ran next to Performance Reviewer (run `0cd68ce0`). <ul><li>The temporary agent ended `failed` with "400 … is not a valid model ID".</li><li>Its trace log carries "Run failed: …".</li><li>Performance Reviewer finished `done` (33.8 s, $0.00089).</li></ul>The temporary agent was then deleted. |
| M7 Sidebar | PASS | "Multi-Agent Review" sits under GLOBAL and is highlighted on `/multi-agent` and `/multi-agent/<id>`. Memory, Agent Performance and CI Runs are absent. |
| M8 | see NFR-4 and NFR-3 above | |
| Keyboard pass (part of M1–M4) | not done | The browser pane was hidden for part of the session, so the checks went through the DOM. Every control is a real `button`, `checkbox`, `tab` or `switch` with an accessible name. |

## Defects found by this check, fixed in the caller's integration pass

1. **Trace drawer stuck on "No trace available yet." after a run completed (M5).**
   - **Cause:** the executor marks the run `done` (`run-executor.ts:298`) before it saves the trace (`:362`). The results page polls the status, so the drawer saw `done`, fetched `/runs/:id/trace` in that gap, got a 404, and cached it with `retry: false`.
   - **Fix:** `client/src/lib/hooks/trace.ts` retries a 404 up to 5 times, one second apart. Every other error stays a single attempt.
2. **Configure run listed the wrong repository's PRs (M2).**
   - **Cause:** `/multi-agent` has no `:repoId` in its path, so the shell fell back to the stored repo, or the first repo (`acme/payments-api`). The `?pr=` id from `DmytrivDev/dev-digest` was therefore never preselected.
   - **Fix:** `MultiAgentResults` adopts the run's `repo_id` as the active repo.

## Environment observation (not a defect of this feature)

On the shared dev DB, Performance Reviewer briefly read `failed` with a null error and a null duration, and later turned `done`. That signature belongs to the boot reaper `reapStaleRunningRuns` (`server/src/modules/reviews/repository/run.repo.ts:155`), which marks every `running` row failed. This worktree's API did not restart (one "listening" line, at 19:07:43), so another API process on the same database most likely booted at that moment. Concurrent API processes sharing one database can fail each other's in-flight runs.
