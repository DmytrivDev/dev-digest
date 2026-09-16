# L01 — Run cost (USD): capture, storage, API

Surface what a review run actually cost. The number already exists —
`reviewer-core` returns `outcome.costUsd` (`reviewer-core/src/review/run.ts`),
summed per LLM call from the provider's `usage` payload (OpenRouter reports the
real price; other providers fall back to `estimateCost` / `PriceBook`). The
server currently discards it. **No additional model call may be introduced.**

## Requirements

### R1 — Storage
`agent_runs.cost_usd`, `double precision`, nullable.
`null` means *un-priced* — unknown model price, failed/cancelled run, or a run
that predates this feature. `null` is NOT the same as a genuine `0` (a free
model); the two must stay distinguishable all the way to the UI.

### R2 — Capture
`ReviewRunExecutor` persists `costUsd` on the successful path and `null` on
every failure path (pre-work failure, per-agent failure, cancellation).
Cost is persisted as computed — never recalculated on read from tokens × price.

### R3 — Contracts
- `RunStats.cost_usd: number | null` — required key, nullable (the run trace is
  always written by us, so the key is always present).
- `RunSummary.cost_usd: number | null` — same reasoning, run history.
- `PrMeta.cost_usd?: number | null` — nullish: `PrDetail` extends `PrMeta` and
  does not compute the aggregate.

Both vendored copies (`server/src/vendor/shared/`, `client/src/vendor/shared/`)
are edited in lock-step.

### R4 — PR-list aggregate
`GET /repos/:id/pulls` returns `cost_usd` per PR = **cost of the latest review
batch**, computed on read (like the existing latest-score aggregate; nothing is
denormalized onto `pull_requests`).

Batch rule — over that PR's `status='done'` runs, newest first:
1. the newest run with a non-null `cost_usd` anchors the batch;
2. every priced run with `ran_at >= anchor.ran_at - 120s` is summed in;
3. no priced run at all → `null`.

The window stands in for a review-session / batch id, which the schema does not
have: "Review all" fans out N agents within seconds, so one number per PR should
mean "what the last review of this PR cost", not "what one of its agents cost".
If a batch id is ever added, replace the window with exact grouping.

## Acceptance criteria

1. A completed run against a priced model stores a non-null `cost_usd`; the same
   value is returned by the run history and inside the persisted run trace.
2. A failed or cancelled run stores `cost_usd = null` and never `0`.
3. `GET /repos/:id/pulls` serializes `cost_usd` for every PR: the sum of the
   latest batch, or `null` when the PR has no priced run.
4. Two agents run on the same PR within the window → the PR's `cost_usd` is
   their sum; a run older than the window is excluded.
5. A real `0` cost survives as `0` (not collapsed into `null`).
6. `pnpm typecheck` and the unit suite pass; the batch aggregation has unit
   coverage that does not need a database.
7. No new LLM/network call anywhere in the path.
