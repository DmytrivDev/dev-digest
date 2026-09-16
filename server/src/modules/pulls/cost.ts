/**
 * PR-list COST rollup (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * The Pull Requests list shows ONE cost per PR: what the PR's latest review
 * cost. "Review all" fans N agents out within seconds, so the number has to be
 * the sum of that whole batch, not of a single agent's run — but the schema has
 * no review-session / batch id, so a time window around the newest priced run
 * stands in for one. Swap the window for exact grouping if a batch id is ever
 * added to `agent_runs`.
 */

/** Runs this close to the newest priced run count as the same review batch. */
export const BATCH_WINDOW_MS = 120_000;

export interface RunCostRow {
  prId: string | null;
  ranAt: Date | null;
  costUsd: number | null;
}

/**
 * Sum the latest review batch's cost per PR.
 *
 * `rows` are completed runs ordered NEWEST FIRST (as the route queries them).
 * Per PR: the first priced run anchors the batch; every later priced run within
 * `windowMs` of that anchor adds in. A PR with no priced run is absent from the
 * map — the route serializes that as `null` ("—" in the UI), which is NOT the
 * same as a genuine 0 from a free model.
 */
export function costByPrFromRuns(
  rows: RunCostRow[],
  windowMs: number = BATCH_WINDOW_MS,
): Map<string, number> {
  const cost = new Map<string, number>();
  const batchEnd = new Map<string, number>();
  for (const r of rows) {
    if (!r.prId || r.costUsd == null) continue;
    const ts = r.ranAt ? r.ranAt.getTime() : 0;
    const end = batchEnd.get(r.prId);
    if (end === undefined) {
      batchEnd.set(r.prId, ts);
      cost.set(r.prId, r.costUsd);
    } else if (ts >= end - windowMs) {
      cost.set(r.prId, (cost.get(r.prId) ?? 0) + r.costUsd);
    }
  }
  return cost;
}
