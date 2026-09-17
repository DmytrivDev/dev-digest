/**
 * PR-list COST rollup (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * The Pull Requests list shows ONE cost per PR: what reviewing it has cost so
 * far — the sum of every SUCCESSFUL run's `cost_usd`. Re-running a review adds
 * to that total rather than replacing it; the per-run breakdown lives on the PR
 * page (Agent runs timeline), so the list only needs the total.
 */

export interface RunCostRow {
  prId: string | null;
  costUsd: number | null;
}

/**
 * Sum the cost of a PR's successful runs.
 *
 * `rows` are the PR's completed runs (the route filters `status='done'`). A PR
 * with no priced run at all is ABSENT from the map — the route serializes that
 * as `null` ("—" in the UI), which is NOT the same as a genuine 0 from a free
 * model. Un-priced runs inside an otherwise priced PR contribute nothing.
 */
export function costByPrFromRuns(rows: RunCostRow[]): Map<string, number> {
  const cost = new Map<string, number>();
  for (const r of rows) {
    if (!r.prId || r.costUsd == null) continue;
    cost.set(r.prId, (cost.get(r.prId) ?? 0) + r.costUsd);
  }
  return cost;
}
