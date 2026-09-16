/**
 * PR-list COST rollup (`modules/pulls/cost.ts`) — the pure rule behind the
 * list's COST column: the sum of every SUCCESSFUL run of a PR. The route feeds
 * it the PR's completed runs, so the rule gets unit coverage independent of the
 * route's queries.
 */
import { describe, it, expect } from 'vitest';
import { costByPrFromRuns } from '../src/modules/pulls/cost.js';

describe('costByPrFromRuns', () => {
  it('sums every priced run of a PR (Review all → N agents at once)', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', costUsd: 0.0013 },
      { prId: 'pr1', costUsd: 0.0014 },
      { prId: 'pr1', costUsd: 0.0012 },
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.0039, 6);
  });

  it('includes earlier reviews of the same PR — the column is a running total', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', costUsd: 0.01 },
      { prId: 'pr1', costUsd: 5 },
    ]);
    expect(cost.get('pr1')).toBeCloseTo(5.01, 6);
  });

  it('keeps PRs apart and ignores rows with no PR', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', costUsd: 0.01 },
      { prId: 'pr2', costUsd: 0.02 },
      { prId: null, costUsd: 99 },
    ]);
    expect(cost.get('pr1')).toBe(0.01);
    expect(cost.get('pr2')).toBe(0.02);
    expect(cost.size).toBe(2);
  });

  it('a PR with no priced run is absent from the map (→ "—", not "$0.00")', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', costUsd: null },
      { prId: 'pr1', costUsd: null },
    ]);
    expect(cost.has('pr1')).toBe(false);
  });

  it('un-priced runs contribute nothing to an otherwise priced PR', () => {
    const cost = costByPrFromRuns([
      { prId: 'pr1', costUsd: 0.002 },
      { prId: 'pr1', costUsd: null },
      { prId: 'pr1', costUsd: 0.003 },
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.005, 6);
  });

  it('keeps a genuine zero (free model) as 0', () => {
    const cost = costByPrFromRuns([{ prId: 'pr1', costUsd: 0 }]);
    expect(cost.get('pr1')).toBe(0);
  });
});
