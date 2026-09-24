import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff } from '../src/modules/smart-diff/helpers.js';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type { SmartDiffRepository } from '../src/modules/smart-diff/repository.js';
import { NotFoundError } from '../src/platform/errors.js';

describe('buildSmartDiff', () => {
  it('(a) emits five groups in order core,tests,wiring,docs,boilerplate, even for zero files', () => {
    const out = buildSmartDiff([], []);
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    for (const g of out.groups) expect(g.files).toEqual([]);
  });

  it('(b) two findings on the same line collapse to one entry, and lines are sorted', () => {
    const out = buildSmartDiff(
      [{ path: 'src/a.ts', additions: 5, deletions: 0 }],
      [
        { file: 'src/a.ts', startLine: 10 },
        { file: 'src/a.ts', startLine: 3 },
        { file: 'src/a.ts', startLine: 10 },
      ],
    );
    const core = out.groups.find((g) => g.role === 'core')!;
    expect(core.files).toHaveLength(1);
    expect(core.files[0]!.finding_lines).toEqual([3, 10]);
  });

  it('(c) a finding on a file outside the PR is ignored', () => {
    const out = buildSmartDiff(
      [{ path: 'src/a.ts', additions: 1, deletions: 0 }],
      [{ file: 'src/other.ts', startLine: 5 }],
    );
    const core = out.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([]);
  });

  it('(d) total_lines is the sum of additions+deletions across all files', () => {
    const out = buildSmartDiff(
      [
        { path: 'src/a.ts', additions: 3, deletions: 2 },
        { path: 'README.md', additions: 1, deletions: 0 },
      ],
      [],
    );
    expect(out.split_suggestion.total_lines).toBe(6);
  });

  it('(e) with no findings, every finding_lines is [] ("before any review")', () => {
    const out = buildSmartDiff(
      [
        { path: 'src/a.ts', additions: 1, deletions: 0 },
        { path: 'src/a.test.ts', additions: 1, deletions: 0 },
      ],
      [],
    );
    for (const g of out.groups) {
      for (const f of g.files) expect(f.finding_lines).toEqual([]);
    }
  });

  it('(f) the output passes SmartDiff.parse', () => {
    const out = buildSmartDiff(
      [
        { path: 'src/a.ts', additions: 3, deletions: 2 },
        { path: 'src/a.test.ts', additions: 1, deletions: 0 },
        { path: 'server/src/modules/index.ts', additions: 1, deletions: 0 },
        { path: 'README.md', additions: 1, deletions: 0 },
        { path: 'pnpm-lock.yaml', additions: 1, deletions: 0 },
      ],
      [{ file: 'src/a.ts', startLine: 3 }],
    );
    expect(() => SmartDiff.parse(out)).not.toThrow();
  });

  it('keeps input order within a group', () => {
    const out = buildSmartDiff(
      [
        { path: 'src/z.ts', additions: 1, deletions: 0 },
        { path: 'src/a.ts', additions: 1, deletions: 0 },
      ],
      [],
    );
    const core = out.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/z.ts', 'src/a.ts']);
  });

  it('sets pseudocode_summary to null and too_big to false', () => {
    const out = buildSmartDiff([{ path: 'src/a.ts', additions: 1, deletions: 0 }], []);
    expect(out.groups.find((g) => g.role === 'core')!.files[0]!.pseudocode_summary).toBeNull();
    expect(out.split_suggestion.too_big).toBe(false);
    expect(out.split_suggestion.proposed_splits).toEqual([]);
  });
});

describe('SmartDiffService', () => {
  it('throws NotFoundError when the PR is not found in this workspace', async () => {
    const fakeRepo = {
      getPull: async () => undefined,
      getPrFiles: async () => [],
      latestReviewFindings: async () => [],
    } as unknown as SmartDiffRepository;
    const service = new SmartDiffService(fakeRepo);
    await expect(service.get('ws1', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('builds a SmartDiff from the repository files and findings', async () => {
    const fakeRepo = {
      getPull: async () => ({ id: 'pr1' }) as never,
      getPrFiles: async () => [{ path: 'src/a.ts', additions: 2, deletions: 0 }],
      latestReviewFindings: async () => [{ file: 'src/a.ts', startLine: 7 }],
    } as unknown as SmartDiffRepository;
    const service = new SmartDiffService(fakeRepo);
    const out = await service.get('ws1', 'pr1');
    const core = out.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([7]);
  });
});
