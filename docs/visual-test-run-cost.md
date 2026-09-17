# Visual test — run cost (USD)

Manual end-to-end check of the COST feature on the three surfaces from the design:
PR list column, Agent-runs timeline, Run-trace drawer. Runs a REAL review, so it
spends real money — with the seeded agents (`deepseek/deepseek-v4-flash`,
$0.089/M prompt · $0.177/M completion) one agent costs ≈ $0.001, all three ≈ $0.003.

## 0. Preconditions

| Check | Command | Expected |
|---|---|---|
| API up | `curl localhost:3001/health` | `{"status":"ok"}` |
| Web up | open http://localhost:3000 | studio renders |
| Migration applied | `cd server && pnpm db:migrate` | `✓ migrations applied` |
| Keys stored | `curl localhost:3001/settings/secrets-status` | `openrouter: true`, `github: true` |
| GitHub token | `curl -X POST localhost:3001/settings/test-connection -H "content-type: application/json" -d '{"provider":"github"}'` | `ok: true`, `Connected as @<you>` |
| OpenRouter key | same with `{"provider":"openrouter"}` | `ok: true`, `N models available` |
| Agents priced | `curl -s localhost:3001/providers/openrouter/models` | the agents' model id is in the list and has `pricing` |

**Do NOT press Refresh / Re-index on the seeded `acme/payments-api`.** That repo does
not exist on GitHub; now that a token is configured, the clone job fails and the
failure takes the whole API process down (see `server/INSIGHTS.md`). Reviews on its
seeded PR are safe — the diff is served from the database.

## 1. Zero state (before any priced run)

1. Open `/repos/<repoId>/pulls`.
2. The table header reads `PULL REQUEST · AUTHOR · SIZE · SCORE · STATUS · COST · UPDATED`.
3. Every PR with no priced run shows `—` in COST.

✅ **Pass:** COST column exists, is positioned between STATUS and UPDATED, header and
row cells line up in one grid (no visual drift at the right edge), and empty cost reads
`—` — never `$0.00`.

## 2. Run a review

1. Open PR #482 → **Run Review** → run all enabled agents.
2. Watch the Agent runs timeline while the runs are in flight.

✅ **Pass:** a run in `running` state shows **no** cost line at all (no `—`, no `$0.00`);
the cost appears only once the run settles.

## 3. Surface 1 — Agent-runs timeline

For each completed run, under the timestamp: `<tokens> tok · $<cost>`, e.g.
`9,119 tok · $0.0013`.

✅ **Pass:**
- tokens are the in+out total, grouped with a comma (`9,119`, not `9 119`);
- cost is rendered with ~2 significant figures for sub-cent values (`$0.0013`), not `$0.00`;
- a **failed** run (e.g. quota/API error) shows its error text and **no** cost;
- cost values survive a page reload (they are persisted, not in-memory).

## 4. Surface 2 — Run-trace drawer

Open the trace icon on a completed run → **Stats** row.

✅ **Pass:** the row reads `DURATION · TOKENS · COST · FINDINGS`, COST sits third,
its value equals the cost shown for that same run on the timeline.

## 5. Surface 3 — PR list COST column

Go back to `/repos/<repoId>/pulls` (or press Refresh in the list — that only re-reads,
it does not re-clone).

✅ **Pass:** the PR's COST equals the **sum of every successful run** of that PR
(all agents of this review, plus any earlier review), not one agent's cost.
Cross-check: `curl -s localhost:3001/repos/<repoId>/pulls | jq '.[] | {number, cost_usd}'`
must return the same number the UI renders.

## 6. Running total (second review)

Run the review again on the same PR, wait for it to finish, reload the list.

✅ **Pass:** COST **grows** — it now equals the first review plus the second, so
re-reviewing adds to the PR's total. The timeline keeps every run with its own
individual cost.

## 7. Negative path

Temporarily break a key (Settings → paste an invalid OpenRouter key) and run a review.

✅ **Pass:** the run lands as `error` with the provider message, `cost_usd` stays `null`,
the timeline shows no cost for it, and the PR-list COST is unchanged — failed runs
never contribute (or `—` if the PR never had a successful run). Restore the real key afterwards.

## Overall success criteria

The feature passes when all of the following hold:

1. All three surfaces show a cost for a completed run, and the same run's value is
   identical on all three.
2. Missing data renders `—` and a genuine zero would render `$0.00` — the two are never
   confused.
3. Running / failed / cancelled runs never show a fabricated `$0.00`.
4. The PR-list number equals the sum of the PR's successful runs and matches the API payload.
5. Nothing in the flow triggers an extra model call — the run's token counts and cost
   come from the same completion the review already made.
6. The PR-list table stays aligned with the new column at desktop width.
