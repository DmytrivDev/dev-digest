import { describe, expect, it } from 'vitest';
import { changedRanges, churn, fileStats } from '../src/modules/brief/helpers/diff-stats.js';

describe('changedRanges (AC-50)', () => {
  it('reads new-side ranges from the hunk headers: +12,7 -> 12-18, +45,4 -> 45-48', () => {
    const patch = [
      '@@ -10,6 +12,7 @@ function a() {',
      ' ctx',
      '+added',
      '@@ -40,3 +45,4 @@',
      ' ctx',
    ].join('\n');
    expect(changedRanges(patch)).toEqual([
      { start: 12, end: 18 },
      { start: 45, end: 48 },
    ]);
  });

  it('defaults a missing count to 1', () => {
    expect(changedRanges('@@ -3 +9 @@\n-x\n+y')).toEqual([{ start: 9, end: 9 }]);
  });

  it('yields no range for a pure deletion (count 0)', () => {
    expect(changedRanges('@@ -5,3 +4,0 @@\n-a\n-b\n-c')).toEqual([]);
  });

  it('returns [] for a null or empty patch', () => {
    expect(changedRanges(null)).toEqual([]);
    expect(changedRanges('')).toEqual([]);
  });

  it('ignores body lines that merely look like a header', () => {
    const patch = '@@ -1,2 +1,2 @@\n+@@ -9 +99 @@\n ctx';
    expect(changedRanges(patch)).toEqual([{ start: 1, end: 2 }]);
  });
});

describe('fileStats', () => {
  it('keeps path, role, counts and ranges, and never the patch text', () => {
    const marker = 'UNIQUE_PATCH_MARKER_7f3a';
    const stats = fileStats([
      { path: 'src/a.ts', additions: 3, deletions: 1, patch: `@@ -1,2 +1,3 @@\n+${marker}` },
      { path: 'logo.png', additions: 0, deletions: 0, patch: null },
    ]);
    expect(stats).toEqual([
      {
        path: 'src/a.ts',
        role: 'core',
        additions: 3,
        deletions: 1,
        ranges: [{ start: 1, end: 3 }],
        hasPatch: true,
      },
      expect.objectContaining({ path: 'logo.png', ranges: [], hasPatch: false }),
    ]);
    expect(JSON.stringify(stats)).not.toContain(marker);
  });

  it('classifies a test file as tests', () => {
    const [stat] = fileStats([{ path: 'src/a.test.ts', additions: 1, deletions: 0, patch: null }]);
    expect(stat?.role).toBe('tests');
  });

  it('churn is additions + deletions', () => {
    expect(churn({ additions: 4, deletions: 6 })).toBe(10);
  });
});
