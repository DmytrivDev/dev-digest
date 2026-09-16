/**
 * PR-list COST rollup (`modules/pulls/cost.ts`) — the pure batch rule behind the
 * list's COST column. The route feeds it completed runs newest-first; the rule
 * decides which of them belong to the PR's LATEST review batch (no batch id in
 * the schema — a time window stands in), so it gets unit coverage independent
 * of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import { costByPrFromRuns, BATCH_WINDOW_MS } from '../src/modules/pulls/cost.js';

const T = Date.UTC(2026, 5, 11, 12, 0, 0);
const at = (msAgo: number) => new Date(T - msAgo);

describe('costByPrFromRuns', () => {
  it('sums every priced run of the latest batch (Review all → N agents at once)', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', ranAt: at(0), costUsd: 0.0013 },
      { prId: 'pr1', ranAt: at(37_000), costUsd: 0.0014 },
      { prId: 'pr1', ranAt: at(41_000), costUsd: 0.0012 },
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.0039, 6);
  });

  it('excludes an older review of the same PR', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', ranAt: at(0), costUsd: 0.01 },
      { prId: 'pr1', ranAt: at(BATCH_WINDOW_MS + 1), costUsd: 5 },
    ]);
    expect(cost.get('pr1')).toBe(0.01);
  });

  it('keeps PRs apart and ignores rows with no PR', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', ranAt: at(0), costUsd: 0.01 },
      { prId: 'pr2', ranAt: at(1_000), costUsd: 0.02 },
      { prId: null, ranAt: at(1_000), costUsd: 99 },
    ]);
    expect(cost.get('pr1')).toBe(0.01);
    expect(cost.get('pr2')).toBe(0.02);
    expect(cost.size).toBe(2);
  });

  it('a PR with no priced run is absent from the map (→ "—", not "$0.00")', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', ranAt: at(0), costUsd: null },
      { prId: 'pr1', ranAt: at(5_000), costUsd: null },
    ]);
    expect(cost.has('pr1')).toBe(false);
  });

  it('keeps a genuine zero (free model) as 0', () => {
    const cost = costByPrFromRuns([{ prId: 'pr1', ranAt: at(0), costUsd: 0 }]);
    expect(cost.get('pr1')).toBe(0);
  });

  it('anchors the batch on the newest PRICED run, skipping un-priced newer ones', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', ranAt: at(0), costUsd: null },
      { prId: 'pr1', ranAt: at(10_000), costUsd: 0.02 },
      { prId: 'pr1', ranAt: at(20_000), costUsd: 0.03 },
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.05, 6);
  });
});
