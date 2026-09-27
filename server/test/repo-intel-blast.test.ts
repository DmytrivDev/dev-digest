import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import {
  excludeSelfCallers,
  capCallersPerSymbol,
  fallbackReason,
} from '../src/modules/repo-intel/helpers.js';
import type { BlastCallerRow, IndexState } from '../src/modules/repo-intel/types.js';

/**
 * L04 (Blast Radius) — repo-intel facade fixes (W2). No DB, no clone:
 * `svc.repo` is patched the same way `repo-intel-facade-degraded.test.ts` does.
 */

function makeState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'sha1',
    indexerVersion: 2,
    updatedAt: new Date(0),
    ...overrides,
  };
}

function buildService(opts: {
  flag: boolean;
  state?: IndexState | null;
  declRows?: Array<{ path: string; name: string; kind: string }>;
  callerRows?: Array<{
    fromPath: string;
    toSymbol: string;
    line: number;
    rank: number;
    declFile: string;
  }>;
  basics?: { id: string; owner: string; name: string; clonePath: string | null } | null;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => opts.state ?? null,
    getRepoBasics: async () => opts.basics ?? null,
    getSymbolRows: async (_repoId: string, paths: string[]) =>
      (opts.declRows ?? [])
        .filter((r) => paths.includes(r.path))
        .map((r) => ({
          path: r.path,
          name: r.name,
          kind: r.kind,
          line: 1,
          endLine: 2,
          exported: true,
          signature: null,
        })),
    getResolvedCallers: async () => opts.callerRows ?? [],
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel facade — blast-radius fixes (W2)', () => {
  it('caps callers PER SYMBOL, not globally (20 of A + 3 of B → 23, not 20)', async () => {
    const callerRowsA = Array.from({ length: 25 }, (_, i) => ({
      fromPath: `caller-a-${i}.ts`,
      toSymbol: 'symbolA',
      line: 10 + i,
      rank: i,
      declFile: 'decl.ts',
    }));
    const callerRowsB = Array.from({ length: 3 }, (_, i) => ({
      fromPath: `caller-b-${i}.ts`,
      toSymbol: 'symbolB',
      line: 10 + i,
      rank: i,
      declFile: 'decl.ts',
    }));
    const svc = buildService({
      flag: true,
      state: makeState(),
      declRows: [
        { path: 'decl.ts', name: 'symbolA', kind: 'function' },
        { path: 'decl.ts', name: 'symbolB', kind: 'function' },
      ],
      callerRows: [...callerRowsA, ...callerRowsB],
    });
    const blast = await svc.getBlastRadius('r1', ['decl.ts']);
    const aCount = blast.callers.filter((c) => c.viaSymbol === 'symbolA').length;
    const bCount = blast.callers.filter((c) => c.viaSymbol === 'symbolB').length;
    expect(aCount).toBe(20);
    expect(bCount).toBe(3);
    expect(blast.callers).toHaveLength(23);
  });

  it('drops a self-caller row (fromPath === declFile)', async () => {
    const svc = buildService({
      flag: true,
      state: makeState(),
      declRows: [{ path: 'decl.ts', name: 'symbolA', kind: 'function' }],
      callerRows: [
        { fromPath: 'decl.ts', toSymbol: 'symbolA', line: 5, rank: 1, declFile: 'decl.ts' },
      ],
    });
    const blast = await svc.getBlastRadius('r1', ['decl.ts']);
    expect(blast.callers).toHaveLength(0);
  });

  it('keeps a caller in a DIFFERENT changed file', async () => {
    const svc = buildService({
      flag: true,
      state: makeState(),
      declRows: [{ path: 'decl.ts', name: 'symbolA', kind: 'function' }],
      callerRows: [
        { fromPath: 'other-changed.ts', toSymbol: 'symbolA', line: 5, rank: 1, declFile: 'decl.ts' },
      ],
    });
    const blast = await svc.getBlastRadius('r1', ['decl.ts', 'other-changed.ts']);
    expect(blast.callers).toHaveLength(1);
    expect(blast.callers[0]!.file).toBe('other-changed.ts');
  });

  it('partial index → degraded:true, reason:index_partial, callers still returned', async () => {
    const svc = buildService({
      flag: true,
      state: makeState({ status: 'partial' }),
      declRows: [{ path: 'decl.ts', name: 'symbolA', kind: 'function' }],
      callerRows: [
        { fromPath: 'caller.ts', toSymbol: 'symbolA', line: 5, rank: 1, declFile: 'decl.ts' },
      ],
    });
    const blast = await svc.getBlastRadius('r1', ['decl.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
    expect(blast.callers).toHaveLength(1);
  });

  it('full index → degraded:false, no reason', async () => {
    const svc = buildService({
      flag: true,
      state: makeState({ status: 'full' }),
      declRows: [{ path: 'decl.ts', name: 'symbolA', kind: 'function' }],
      callerRows: [
        { fromPath: 'caller.ts', toSymbol: 'symbolA', line: 5, rank: 1, declFile: 'decl.ts' },
      ],
    });
    const blast = await svc.getBlastRadius('r1', ['decl.ts']);
    expect(blast.degraded).toBe(false);
    expect(blast.reason).toBeUndefined();
    expect(blast.indexStatus).toBe('full');
    expect(blast.indexedSha).toBe('sha1');
  });

  it('flag off → reason:flag_off', async () => {
    const svc = buildService({ flag: false, basics: null });
    const blast = await svc.getBlastRadius('r1', ['decl.ts']);
    expect(blast.reason).toBe('flag_off');
    expect(blast.degraded).toBe(true);
  });

  it('no state row → reason:no_data', async () => {
    const svc = buildService({ flag: true, state: null, basics: null });
    const blast = await svc.getBlastRadius('r1', ['decl.ts']);
    expect(blast.reason).toBe('no_data');
  });

  it('a failed state → reason:index_failed', async () => {
    const svc = buildService({
      flag: true,
      state: makeState({ status: 'failed' }),
      basics: null,
    });
    const blast = await svc.getBlastRadius('r1', ['decl.ts']);
    expect(blast.reason).toBe('index_failed');
  });
});

describe('repo-intel/helpers — pure functions', () => {
  it('excludeSelfCallers drops rows whose file equals declFile', () => {
    const rows = [
      { file: 'a.ts', declFile: 'a.ts' },
      { file: 'b.ts', declFile: 'a.ts' },
    ];
    expect(excludeSelfCallers(rows)).toEqual([{ file: 'b.ts', declFile: 'a.ts' }]);
  });

  it('capCallersPerSymbol caps each group independently and sorts ties by file/line', () => {
    const rows: BlastCallerRow[] = [
      { file: 'z.ts', symbol: 'f1', viaSymbol: 'A', line: 5, rank: 0, declFile: 'd.ts' },
      { file: 'a.ts', symbol: 'f2', viaSymbol: 'A', line: 2, rank: 0, declFile: 'd.ts' },
      { file: 'a.ts', symbol: 'f3', viaSymbol: 'A', line: 1, rank: 0, declFile: 'd.ts' },
      { file: 'x.ts', symbol: 'f4', viaSymbol: 'B', line: 1, rank: 5, declFile: 'd.ts' },
    ];
    const capped = capCallersPerSymbol(rows, 2);
    const aGroup = capped.filter((r) => r.viaSymbol === 'A');
    expect(aGroup).toHaveLength(2);
    expect(aGroup[0]!.file).toBe('a.ts');
    expect(aGroup[0]!.line).toBe(1);
  });

  it('fallbackReason: flag off wins first', () => {
    expect(fallbackReason({ flagOn: false, state: null })).toBe('flag_off');
  });

  it('fallbackReason: state.degradedReason wins over status', () => {
    expect(
      fallbackReason({
        flagOn: true,
        state: {
          repoId: 'r',
          status: 'degraded',
          filesIndexed: 0,
          filesSkipped: 0,
          durationMs: 0,
          lastIndexedSha: '',
          indexerVersion: 1,
          updatedAt: new Date(0),
          degradedReason: 'repo_too_large',
        },
      }),
    ).toBe('repo_too_large');
  });

  it('fallbackReason: failed status → index_failed', () => {
    expect(
      fallbackReason({
        flagOn: true,
        state: {
          repoId: 'r',
          status: 'failed',
          filesIndexed: 0,
          filesSkipped: 0,
          durationMs: 0,
          lastIndexedSha: '',
          indexerVersion: 1,
          updatedAt: new Date(0),
        },
      }),
    ).toBe('index_failed');
  });

  it('fallbackReason: no state at all → no_data', () => {
    expect(fallbackReason({ flagOn: true, state: null })).toBe('no_data');
  });
});
