import { describe, expect, it } from 'vitest';
import { BriefInput, type BlastRadius } from '@devdigest/shared';
import {
  blastInput,
  buildInputs,
  diffStatsInput,
  linkedIssueNumber,
  stripControl,
  unionDocPaths,
} from '../src/modules/brief/helpers/inputs.js';

const REPO = { owner: 'acme', name: 'web' };

describe('linkedIssueNumber (AC-53)', () => {
  it('takes a closing-keyword reference on this repo', () => {
    expect(linkedIssueNumber('Fixes #12', REPO)).toBe(12);
    expect(linkedIssueNumber('closes acme/web#7', REPO)).toBe(7);
    expect(linkedIssueNumber('Resolves ACME/Web#8', REPO)).toBe(8);
  });

  it('ignores a mention without a closing keyword', () => {
    expect(linkedIssueNumber('see #12', REPO)).toBeNull();
  });

  it('ignores a closing reference to another repository', () => {
    expect(linkedIssueNumber('Fixes acme/other#12', REPO)).toBeNull();
    expect(linkedIssueNumber('Fixes https://github.com/acme/other/issues/12', REPO)).toBeNull();
  });

  it('skips a foreign reference and takes the first same-repo one', () => {
    expect(linkedIssueNumber('Fixes acme/other#1 and fixes #2', REPO)).toBe(2);
  });

  it('returns null for an empty body', () => {
    expect(linkedIssueNumber('', REPO)).toBeNull();
    expect(linkedIssueNumber(null, REPO)).toBeNull();
  });
});

describe('stripControl (AC-69)', () => {
  it('removes U+0007, U+001B and U+007F, keeps tab and newline', () => {
    expect(stripControl('a\u0007b\u001bc\u007fd\te\nf')).toBe('abcd\te\nf');
  });
});

const radius = (over: Partial<BlastRadius>): BlastRadius => ({
  changed_symbols: [{ name: 'f', file: 'src/a.ts', kind: 'function' }],
  downstream: [],
  summary: 's',
  ...over,
});

describe('blastInput (AC-57, AC-58)', () => {
  it('a healthy result is used and usable, with no reason', () => {
    expect(blastInput(radius({}))).toEqual({ status: 'used', usable: true });
  });

  it('a degraded result with a reason stays used and carries the reason', () => {
    expect(blastInput(radius({ degraded: true, reason: 'index_partial' }))).toEqual({
      status: 'used',
      reason: 'index_partial',
      usable: true,
    });
  });

  it('a degraded no_data result WITH changed symbols is used/no_data', () => {
    expect(blastInput(radius({ degraded: true, reason: 'no_data' }))).toEqual({
      status: 'used',
      reason: 'no_data',
      usable: true,
    });
  });

  it('zero changed symbols is missing (no_data when no reason)', () => {
    expect(blastInput(radius({ changed_symbols: [] }))).toEqual({
      status: 'missing',
      reason: 'no_data',
      usable: false,
    });
  });

  it('zero changed symbols keeps the degraded reason', () => {
    expect(
      blastInput(radius({ changed_symbols: [], degraded: true, reason: 'repo_too_large' })),
    ).toEqual({ status: 'missing', reason: 'repo_too_large', usable: false });
  });

  it('files_unavailable is missing even with symbols', () => {
    expect(blastInput(radius({ reason: 'files_unavailable' }))).toEqual({
      status: 'missing',
      reason: 'files_unavailable',
      usable: false,
    });
  });

  it('a thrown lookup is missing/index_failed', () => {
    expect(blastInput('threw')).toEqual({ status: 'missing', reason: 'index_failed', usable: false });
  });
});

describe('unionDocPaths (AC-55)', () => {
  it('orders agents by name, keeps each agent order and the first position of a path', () => {
    const out = unionDocPaths([
      { agentName: 'zeta', paths: ['docs/c.md', 'docs/a.md'] },
      { agentName: 'alpha', paths: ['docs/a.md', 'docs/b.md'] },
    ]);
    expect(out).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md']);
  });

  it('is empty for no agents', () => {
    expect(unionDocPaths([])).toEqual([]);
  });
});

describe('diffStatsInput (AC-59)', () => {
  it('fewer stored files than the PR reports -> truncated/file_list_truncated', () => {
    expect(diffStatsInput(300, 450)).toEqual({
      source: 'diff_stats',
      status: 'truncated',
      reason: 'file_list_truncated',
    });
  });

  it('all files stored -> used', () => {
    expect(diffStatsInput(5, 5)).toEqual({ source: 'diff_stats', status: 'used' });
  });
});

describe('buildInputs (AC-60)', () => {
  it('always returns the six sources in the fixed order, each valid against the contract', () => {
    const out = buildInputs([
      { source: 'specs', status: 'missing', reason: 'none_attached' },
      { source: 'intent', status: 'used' },
    ]);
    expect(out.map((i) => i.source)).toEqual([
      'intent',
      'blast',
      'diff_stats',
      'description',
      'linked_issue',
      'specs',
    ]);
    for (const entry of out) expect(BriefInput.safeParse(entry).success).toBe(true);
    expect(out.find((i) => i.source === 'blast')).toEqual({
      source: 'blast',
      status: 'missing',
      reason: 'empty',
    });
  });

  it('gives every non-used entry a reason, even if the record had none', () => {
    const out = buildInputs([{ source: 'intent', status: 'missing' } as never]);
    expect(out[0]).toEqual({ source: 'intent', status: 'missing', reason: 'empty' });
  });

  it('keeps a used entry reason (degraded blast) and omitted on diff_stats only', () => {
    const out = buildInputs([
      { source: 'blast', status: 'used', reason: 'index_partial' },
      { source: 'diff_stats', status: 'truncated', reason: 'over_budget', omitted: 12 },
      { source: 'specs', status: 'truncated', reason: 'over_budget', omitted: 3 },
    ]);
    expect(out.find((i) => i.source === 'blast')).toEqual({
      source: 'blast',
      status: 'used',
      reason: 'index_partial',
    });
    expect(out.find((i) => i.source === 'diff_stats')?.omitted).toBe(12);
    expect(out.find((i) => i.source === 'specs')?.omitted).toBeUndefined();
  });
});
