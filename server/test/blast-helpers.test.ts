import { describe, it, expect } from 'vitest';
import {
  blastSummary,
  buildPrHistory,
  emptyBlastRadius,
  pickHistoryPaths,
  toBlastRadius,
} from '../src/modules/blast/helpers.js';
import type { BlastResult, FileRankRow } from '../src/modules/repo-intel/types.js';
import type { PathPullRequest } from '@devdigest/shared';

function result(overrides: Partial<BlastResult> = {}): BlastResult {
  return {
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
    ...overrides,
  };
}

describe('toBlastRadius — grouping (Key decision 5)', () => {
  it('groups callers by viaSymbol', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'A', kind: 'function' }],
        callers: [
          { file: 'b.ts', symbol: 'f1', viaSymbol: 'A', line: 1, rank: 1, declFile: 'a.ts' },
          { file: 'c.ts', symbol: 'f2', viaSymbol: 'A', line: 2, rank: 1, declFile: 'a.ts' },
        ],
      }),
    );
    expect(blast.downstream).toHaveLength(1);
    expect(blast.downstream[0]!.callers).toHaveLength(2);
  });

  it('sorts groups by max rank desc, then caller count desc, then symbol asc', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'a.ts', name: 'Low', kind: 'function' },
          { file: 'a.ts', name: 'High', kind: 'function' },
        ],
        callers: [
          { file: 'b.ts', symbol: 'f1', viaSymbol: 'Low', line: 1, rank: 1, declFile: 'a.ts' },
          { file: 'c.ts', symbol: 'f2', viaSymbol: 'High', line: 1, rank: 9, declFile: 'a.ts' },
        ],
      }),
    );
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['High', 'Low']);
  });

  it('breaks a rank tie at 0 by file asc then line asc inside a group', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'A', kind: 'function' }],
        callers: [
          { file: 'z.ts', symbol: 'fz', viaSymbol: 'A', line: 1, rank: 0, declFile: 'a.ts' },
          { file: 'a.ts', symbol: 'fa2', viaSymbol: 'A', line: 5, rank: 0, declFile: 'x.ts' },
          { file: 'a.ts', symbol: 'fa1', viaSymbol: 'A', line: 1, rank: 0, declFile: 'x.ts' },
        ],
      }),
    );
    expect(blast.downstream[0]!.callers.map((c) => `${c.file}:${c.line}`)).toEqual([
      'a.ts:1',
      'a.ts:5',
      'z.ts:1',
    ]);
  });

  it('endpoints/crons per group come ONLY from that group\'s caller files', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'a.ts', name: 'A', kind: 'function' },
          { file: 'a.ts', name: 'B', kind: 'function' },
        ],
        callers: [
          { file: 'ha.ts', symbol: 'fa', viaSymbol: 'A', line: 1, rank: 1, declFile: 'a.ts' },
          { file: 'hb.ts', symbol: 'fb', viaSymbol: 'B', line: 1, rank: 1, declFile: 'a.ts' },
        ],
        factsByFile: {
          'ha.ts': { endpoints: ['GET /a'], crons: ['cron-a'] },
          'hb.ts': { endpoints: ['GET /b'], crons: [] },
        },
      }),
    );
    const groupA = blast.downstream.find((d) => d.symbol === 'A')!;
    const groupB = blast.downstream.find((d) => d.symbol === 'B')!;
    expect(groupA.endpoints_affected).toEqual(['GET /a']);
    expect(groupA.crons_affected).toEqual(['cron-a']);
    expect(groupB.endpoints_affected).toEqual(['GET /b']);
    expect(groupB.crons_affected).toEqual([]);
  });

  it('each caller carries its OWN endpoints/crons', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'A', kind: 'function' }],
        callers: [
          { file: 'ha.ts', symbol: 'fa', viaSymbol: 'A', line: 1, rank: 1, declFile: 'a.ts' },
        ],
        factsByFile: { 'ha.ts': { endpoints: ['GET /a'], crons: ['cron-a'] } },
      }),
    );
    expect(blast.downstream[0]!.callers[0]!.endpoints).toEqual(['GET /a']);
    expect(blast.downstream[0]!.callers[0]!.crons).toEqual(['cron-a']);
  });

  it('counts and summary for many', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'A', kind: 'function' }],
        callers: [
          { file: 'ha.ts', symbol: 'fa', viaSymbol: 'A', line: 1, rank: 1, declFile: 'a.ts' },
          { file: 'hb.ts', symbol: 'fb', viaSymbol: 'A', line: 1, rank: 1, declFile: 'a.ts' },
        ],
        factsByFile: {
          'ha.ts': { endpoints: ['GET /a'], crons: [] },
          'hb.ts': { endpoints: ['GET /b'], crons: [] },
        },
      }),
    );
    expect(blast.counts).toEqual({ symbols: 1, callers: 2, endpoints: 2, crons: 0 });
  });

  it('counts and summary for zero', () => {
    const blast = toBlastRadius(result());
    expect(blast.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(blast.summary).toBe('0 symbols changed → 0 callers, 0 endpoints, 0 crons');
  });

  it('factsByFile absent → empty endpoint lists, no throw', () => {
    expect(() =>
      toBlastRadius(
        result({
          changedSymbols: [{ file: 'a.ts', name: 'A', kind: 'function' }],
          callers: [
            { file: 'ha.ts', symbol: 'fa', viaSymbol: 'A', line: 1, rank: 1, declFile: 'a.ts' },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('the reason mapping is 1:1', () => {
    const blast = toBlastRadius(result({ degraded: true, reason: 'index_partial' }));
    expect(blast.reason).toBe('index_partial');
  });

  it('a changed symbol with no callers is counted but absent from downstream', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'a.ts', name: 'Lonely', kind: 'function' },
          { file: 'a.ts', name: 'Called', kind: 'function' },
        ],
        callers: [
          { file: 'b.ts', symbol: 'f1', viaSymbol: 'Called', line: 1, rank: 1, declFile: 'a.ts' },
        ],
      }),
    );
    expect(blast.changed_symbols).toHaveLength(2);
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['Called']);
  });
});

describe('blastSummary', () => {
  it('singularizes at count 1', () => {
    expect(blastSummary({ symbols: 1, callers: 1, endpoints: 1, crons: 1 })).toBe(
      '1 symbol changed → 1 caller, 1 endpoint, 1 cron',
    );
  });

  it('pluralizes at count > 1', () => {
    expect(blastSummary({ symbols: 3, callers: 7, endpoints: 2, crons: 0 })).toBe(
      '3 symbols changed → 7 callers, 2 endpoints, 0 crons',
    );
  });
});

describe('emptyBlastRadius', () => {
  it('is degraded with reason files_unavailable and zero counts', () => {
    const blast = emptyBlastRadius('files_unavailable');
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('files_unavailable');
    expect(blast.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(blast.changed_symbols).toEqual([]);
    expect(blast.downstream).toEqual([]);
  });
});

describe('pickHistoryPaths', () => {
  it('picks the highest percentile first, then path asc on ties', () => {
    const ranks: FileRankRow[] = [
      { path: 'z.ts', percentile: 0.9 },
      { path: 'a.ts', percentile: 0.5 },
      { path: 'b.ts', percentile: 0.5 },
    ];
    expect(pickHistoryPaths(['a.ts', 'b.ts', 'z.ts'], ranks, 5)).toEqual(['z.ts', 'a.ts', 'b.ts']);
  });

  it('treats an unranked path as percentile 0', () => {
    const ranks: FileRankRow[] = [{ path: 'ranked.ts', percentile: 0.1 }];
    expect(pickHistoryPaths(['unranked.ts', 'ranked.ts'], ranks, 5)).toEqual(['ranked.ts', 'unranked.ts']);
  });

  it('caps at max', () => {
    expect(pickHistoryPaths(['a.ts', 'b.ts', 'c.ts'], [], 2)).toHaveLength(2);
  });
});

function pull(overrides: Partial<PathPullRequest> = {}): PathPullRequest {
  return { number: 10, title: 'A change', author: 'octocat', merged_at: '2026-01-01T00:00:00Z', ...overrides };
}

describe('buildPrHistory', () => {
  it('de-duplicates by PR number and excludes the current PR', () => {
    const items = buildPrHistory(
      [
        { path: 'a.ts', pulls: [pull({ number: 10 }), pull({ number: 20, merged_at: '2026-01-02T00:00:00Z' })] },
        { path: 'b.ts', pulls: [pull({ number: 20, merged_at: '2026-01-02T00:00:00Z' })] },
      ],
      8, // current PR
      null,
      5,
    );
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.pr_number === 20)?.files_overlap).toEqual(['a.ts', 'b.ts']);
    expect(items.some((i) => i.pr_number === 8)).toBe(false);
  });

  it('sorts by merged_at desc and caps at max', () => {
    const perPath = [
      {
        path: 'a.ts',
        pulls: [
          pull({ number: 1, merged_at: '2026-01-01T00:00:00Z' }),
          pull({ number: 2, merged_at: '2026-03-01T00:00:00Z' }),
          pull({ number: 3, merged_at: '2026-02-01T00:00:00Z' }),
        ],
      },
    ];
    const items = buildPrHistory(perPath, 99, null, 2);
    expect(items.map((i) => i.pr_number)).toEqual([2, 3]);
  });

  it('notes: the "Merged N days before" branch when prOpenedAt is after merged_at', () => {
    const items = buildPrHistory(
      [{ path: 'a.ts', pulls: [pull({ merged_at: '2026-01-01T00:00:00Z' })] }],
      99,
      '2026-01-11T00:00:00Z',
      5,
    );
    expect(items[0]!.notes).toBe('Merged 10 days before this PR was opened; overlaps 1 changed file.');
  });

  it('notes: just the overlap clause when prOpenedAt is null', () => {
    const items = buildPrHistory(
      [{ path: 'a.ts', pulls: [pull()] }],
      99,
      null,
      5,
    );
    expect(items[0]!.notes).toBe('overlaps 1 changed file.');
  });

  it('notes: just the overlap clause when the PR opened before the merge', () => {
    const items = buildPrHistory(
      [{ path: 'a.ts', pulls: [pull({ merged_at: '2026-05-01T00:00:00Z' })] }],
      99,
      '2026-01-01T00:00:00Z',
      5,
    );
    expect(items[0]!.notes).toBe('overlaps 1 changed file.');
  });
});
