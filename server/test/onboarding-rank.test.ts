import { describe, it, expect } from 'vitest';
import type { CommitTouch } from '@devdigest/shared';
import {
  commitCounts,
  dropUnsafePaths,
  hasControlChar,
  historyWindow,
  hotness,
  inWindow,
  needsHistoryFetch,
  rankFiles,
} from '../src/modules/onboarding/helpers/rank.js';

const DAY_MS = 86_400_000;
const INDEXED = '2026-06-01T12:00:00.000Z';
const daysBefore = (n: number) => new Date(Date.parse(INDEXED) - n * DAY_MS).toISOString();

function touch(over: Partial<CommitTouch> & { files: string[] }): CommitTouch {
  return {
    sha: 'a'.repeat(40),
    committedAt: INDEXED,
    parents: ['b'.repeat(40)],
    boundary: false,
    ...over,
  };
}

describe('rankFiles (AC-52, AC-57, AC-60, AC-96)', () => {
  it('ranks pagerank 0.2 with hotness 0.5 (0.3) above pagerank 0.25 with hotness 0', () => {
    const ranked = rankFiles(
      [
        { path: 'cold.ts', pagerank: 0.25 },
        { path: 'hot.ts', pagerank: 0.2 },
      ],
      new Map([
        ['hot.ts', 0.5],
        ['cold.ts', 0],
      ]),
    );
    expect(ranked.map((r) => r.path)).toEqual(['hot.ts', 'cold.ts']);
    expect(ranked[0]?.rank).toBeCloseTo(0.3, 10);
    expect(ranked[1]?.rank).toBe(0.25);
    expect(ranked[0]).toMatchObject({ pagerank: 0.2, hotness: 0.5 });
  });

  it('orders by pagerank alone when hotness is null (history unobtainable)', () => {
    const ranked = rankFiles(
      [
        { path: 'a.ts', pagerank: 0.1 },
        { path: 'b.ts', pagerank: 0.4 },
      ],
      null,
    );
    expect(ranked.map((r) => r.path)).toEqual(['b.ts', 'a.ts']);
    expect(ranked.every((r) => r.hotness === 0 && r.rank === r.pagerank)).toBe(true);
  });

  it('breaks an equal rank by ascending code-point path order', () => {
    const ranked = rankFiles(
      [
        { path: 'b.ts', pagerank: 0.5 },
        { path: 'a.ts', pagerank: 0.5 },
        { path: 'B.ts', pagerank: 0.5 },
      ],
      null,
    );
    // 'B' (0x42) sorts before 'a' (0x61) by code point — localeCompare would not.
    expect(ranked.map((r) => r.path)).toEqual(['B.ts', 'a.ts', 'b.ts']);
  });

  it('leaves out a path with a control character', () => {
    const ranked = rankFiles(
      [
        { path: 'ok.ts', pagerank: 0.1 },
        { path: 'bad\nname.ts', pagerank: 0.9 },
        { path: 'del\u007f.ts', pagerank: 0.9 },
      ],
      null,
    );
    expect(ranked.map((r) => r.path)).toEqual(['ok.ts']);
  });

  it('returns the same order for the same input twice', () => {
    const files = [
      { path: 'c.ts', pagerank: 0.3 },
      { path: 'a.ts', pagerank: 0.3 },
      { path: 'b.ts', pagerank: 0.6 },
    ];
    expect(rankFiles(files, null)).toEqual(rankFiles([...files].reverse(), null));
  });
});

describe('hotness (AC-53)', () => {
  it('divides by the highest count: 4, 2, 0 yield 1, 0.5, 0', () => {
    const h = hotness(
      new Map([
        ['a.ts', 4],
        ['b.ts', 2],
        ['c.ts', 0],
      ]),
    );
    expect([h.get('a.ts'), h.get('b.ts'), h.get('c.ts')]).toEqual([1, 0.5, 0]);
  });

  it('is 0 for every file when the highest count is 0', () => {
    const h = hotness(
      new Map([
        ['a.ts', 0],
        ['b.ts', 0],
      ]),
    );
    expect([...h.values()]).toEqual([0, 0]);
  });
});

describe('history window (AC-54)', () => {
  it('spans the 180 days ending at the indexed commit date, inclusive', () => {
    const w = historyWindow(INDEXED);
    expect(w.end).toBe(INDEXED);
    expect(w.start).toBe(daysBefore(180));
    expect(inWindow(daysBefore(180), w)).toBe(true);
    expect(inWindow(INDEXED, w)).toBe(true);
  });

  it('counts a commit 179 days before the indexed commit and not one 181 days before', () => {
    const w = historyWindow(INDEXED);
    const counts = commitCounts(
      [
        touch({ sha: '1'.repeat(40), committedAt: daysBefore(179), files: ['a.ts'] }),
        touch({ sha: '2'.repeat(40), committedAt: daysBefore(181), files: ['b.ts'] }),
      ],
      w,
      ['a.ts', 'b.ts'],
    );
    expect(counts.get('a.ts')).toBe(1);
    expect(counts.get('b.ts')).toBe(0);
  });

  it('treats an unparsable commit date as outside the window', () => {
    expect(inWindow('not a date', historyWindow(INDEXED))).toBe(false);
  });
});

describe('commitCounts (AC-55)', () => {
  it('does not count a shallow-boundary commit that "adds" every file', () => {
    const w = historyWindow(INDEXED);
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const counts = commitCounts(
      [
        touch({ sha: '1'.repeat(40), committedAt: daysBefore(1), files: ['a.ts'] }),
        touch({ sha: '2'.repeat(40), committedAt: daysBefore(2), files: ['a.ts', 'b.ts'] }),
        touch({
          sha: '3'.repeat(40),
          committedAt: daysBefore(3),
          parents: [],
          boundary: true,
          files,
        }),
      ],
      w,
      files,
    );
    expect([counts.get('a.ts'), counts.get('b.ts'), counts.get('c.ts')]).toEqual([2, 1, 0]);
  });

  it('counts a real root commit (no parents, not a boundary)', () => {
    const counts = commitCounts(
      [touch({ parents: [], boundary: false, files: ['a.ts'] })],
      historyWindow(INDEXED),
      ['a.ts'],
    );
    expect(counts.get('a.ts')).toBe(1);
  });

  it('counts a file once per commit and ignores files that are not indexed', () => {
    const counts = commitCounts(
      [touch({ files: ['a.ts', 'a.ts', 'gone.ts'] })],
      historyWindow(INDEXED),
      ['a.ts'],
    );
    expect(counts.get('a.ts')).toBe(1);
    expect(counts.has('gone.ts')).toBe(false);
  });

  it('leaves a control-character path out of the counts', () => {
    const counts = commitCounts([touch({ files: ['x\ny.ts'] })], historyWindow(INDEXED), [
      'x\ny.ts',
    ]);
    expect(counts.size).toBe(0);
  });
});

describe('needsHistoryFetch (AC-56)', () => {
  const w = historyWindow(INDEXED);

  it('is true for a depth-1 touch list (the only commit is a boundary inside the window)', () => {
    expect(
      needsHistoryFetch([touch({ parents: [], boundary: true, files: ['a.ts'] })], w),
    ).toBe(true);
  });

  it('is false for a non-shallow list', () => {
    expect(
      needsHistoryFetch(
        [touch({ files: ['a.ts'] }), touch({ parents: [], boundary: false, files: ['a.ts'] })],
        w,
      ),
    ).toBe(false);
  });

  it('is false when the boundary commit lies before the window', () => {
    expect(
      needsHistoryFetch(
        [
          touch({ files: ['a.ts'] }),
          touch({ committedAt: daysBefore(200), parents: [], boundary: true, files: ['a.ts'] }),
        ],
        w,
      ),
    ).toBe(false);
  });
});

describe('path hygiene (AC-96)', () => {
  it('detects U+0000-U+001F and U+007F', () => {
    expect(hasControlChar('a\u0000b')).toBe(true);
    expect(hasControlChar('a\tb')).toBe(true);
    expect(hasControlChar('a\u007fb')).toBe(true);
    expect(hasControlChar('src/a b/ü.ts')).toBe(false);
  });

  it('dropUnsafePaths keeps order and drops only the unsafe rows', () => {
    const rows = [{ p: 'a.ts' }, { p: 'b\n.ts' }, { p: 'c.ts' }];
    expect(dropUnsafePaths(rows, (r) => r.p)).toEqual([{ p: 'a.ts' }, { p: 'c.ts' }]);
  });
});
