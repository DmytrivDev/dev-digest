import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { isJunkPath, walkTotalFromStats } from '../src/modules/repo-intel/helpers.js';

/**
 * Onboarding tour (SPEC-02, W4) — `getGraphSnapshot`, `walkTotalFromStats` and the
 * exported `isJunkPath`. No Postgres: the service's `repo` is replaced by a stub
 * (same pattern as repo-intel-facade-degraded.test.ts).
 */

function buildService(flag: boolean): RepoIntelService {
  const container = { config: { repoIntelEnabled: flag }, db: {} as never } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getAllFileRanks: async () => [
      { path: 'a.ts', pagerank: 0.4 },
      { path: 'b.ts', pagerank: 0.1 },
    ],
    getEdges: async () => [{ fromFile: 'a.ts', toFile: 'b.ts' }],
    getAllFileFacts: async () => [
      { path: 'a.ts', endpoints: ['GET /x', 'POST /y'] },
      { path: 'b.ts', endpoints: [] },
    ],
  };
  return svc;
}

describe('RepoIntel.getGraphSnapshot', () => {
  it('flag off -> empty snapshot, never throws', async () => {
    const snap = await buildService(false).getGraphSnapshot('r1');
    expect(snap).toEqual({ files: [], edges: [], endpoints: [] });
  });

  it('flag on -> files carry pagerank, edges and endpoints are mapped to plain data', async () => {
    const snap = await buildService(true).getGraphSnapshot('r1');
    expect(snap.files).toEqual([
      { path: 'a.ts', pagerank: 0.4 },
      { path: 'b.ts', pagerank: 0.1 },
    ]);
    expect(snap.edges).toEqual([{ from: 'a.ts', to: 'b.ts' }]);
    expect(snap.endpoints).toEqual([
      { file: 'a.ts', endpoint: 'GET /x' },
      { file: 'a.ts', endpoint: 'POST /y' },
    ]);
  });
});

describe('walkTotalFromStats', () => {
  it('truncated walk -> filesSeen + bounded', () => {
    expect(walkTotalFromStats({ filesSeen: 5000, bounded: 3000 })).toBe(8000);
  });

  it('bounded 0 -> null', () => {
    expect(walkTotalFromStats({ filesSeen: 10, bounded: 0 })).toBeNull();
  });

  it('empty stats -> null', () => {
    expect(walkTotalFromStats({})).toBeNull();
  });

  it('bounded without a numeric filesSeen -> null (never NaN)', () => {
    expect(walkTotalFromStats({ bounded: 5 })).toBeNull();
  });
});

describe('isJunkPath (moved to repo-intel/helpers.ts)', () => {
  it('keeps its old answers', () => {
    expect(isJunkPath('a.test.ts')).toBe(true);
    expect(isJunkPath('db/migrations/1.ts')).toBe(true);
    expect(isJunkPath('src/x.ts')).toBe(false);
  });
});
