# L01 — Findings severity breakdown: PR-list aggregate

Surface, per PR in the Pull Requests list, how many findings of each severity
the reviewer produced. Everything needed is already persisted — this is a
group/count over `findings.severity`. **No additional model call may be
introduced**, on this endpoint or anywhere in the path.

## Requirements

### R1 — Which review the breakdown describes
The PR's **latest review** (`reviews.kind = 'review'`, newest `created_at`) —
deliberately the same rule the list's existing `score` uses, so the SCORE and
FINDINGS columns of one row can never describe different runs. With a fan-out
("Review all"), each agent writes its own review row, so "latest" means one
agent's review — exactly as `score` already behaves.

Unlike `cost_usd`, this is **not** a running total: re-reviewing REPLACES the
breakdown.

### R2 — Rollup rule
Pure, DB-free, in `server/src/modules/pulls/findings.ts` (same split as
`cost.ts` / `status.ts`, so it unit-tests without a database). It reuses
`rollupSeverities()` / `SeverityCounts` from `status.ts`.

1. Findings are counted **as stored** — accepted and dismissed ones still count,
   because they are still rendered on the PR page.
2. A severity outside the `Severity` enum is ignored (the column is plain
   `text`, not a pg enum).
3. A PR whose latest review found nothing → `{0,0,0}` ("reviewed, clean").
4. A PR with **no** review → absent from the map → `null` on the wire.
   `null` and `{0,0,0}` are different states and must stay distinguishable.

### R3 — Contract
`PrMeta.findings?: { critical: number; warning: number; suggestion: number } | null`
— nullish, list-endpoint only (`PrDetail` extends `PrMeta` and does not compute
it; neither do `GitHubClient.listPullRequests` or the adapter mocks).
Both vendored copies (`server/src/vendor/shared/`, `client/src/vendor/shared/`)
are edited in lock-step.

### R4 — Query shape
Computed **on read** in `GET /repos/:id/pulls`, nothing denormalized onto
`pull_requests`: the existing latest-review pass also captures the review id,
then one `review_id IN (…)` query fetches those reviews' severities. `findings`
carries no `workspace_id` — tenancy is inherited from review ids that came from
an already workspace-scoped read.

## Acceptance criteria

1. `GET /repos/:id/pulls` serializes `findings` for every PR.
2. A PR that has never been reviewed serializes `findings: null`, never a row of
   zeros; a reviewed PR whose run was clean serializes `{0,0,0}`.
3. Findings belonging to an older review of the same PR are NOT counted — a
   second review replaces the breakdown rather than adding to it.
4. The breakdown describes the same review the row's `score` comes from.
5. Two PRs never bleed into each other's counts.
6. `pnpm typecheck` and the unit suite pass; the rollup has unit coverage that
   needs no database, and the "latest review wins" rule is pinned by an
   integration test against a real Postgres.
7. No new LLM/network call anywhere in the path.
