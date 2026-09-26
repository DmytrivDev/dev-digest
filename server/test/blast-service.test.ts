import { describe, it, expect, vi } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';
import { MAX_COMMITS_PER_PATH, MAX_HISTORY_PATHS } from '../src/modules/blast/constants.js';
import type { BlastPullRow, BlastRepository } from '../src/modules/blast/repository.js';
import type { GitHubClient } from '@devdigest/shared';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const PULL: BlastPullRow = {
  prId: 'pr1',
  number: 8,
  repoId: 'repo1',
  openedAt: new Date(0),
  owner: 'acme',
  name: 'payments-api',
};

function makeRepo(overrides: Partial<BlastRepository> = {}): BlastRepository {
  return {
    getPullWithRepo: vi.fn(async () => PULL),
    getPrFilePaths: vi.fn(async () => []),
    ...overrides,
  } as unknown as BlastRepository;
}

function makeRepoIntel(
  getBlastRadius: RepoIntel['getBlastRadius'] = vi.fn(async () => ({
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
  })),
): Pick<RepoIntel, 'getBlastRadius' | 'getFileRank'> {
  return { getBlastRadius, getFileRank: vi.fn(async () => []) };
}

describe('BlastService.get', () => {
  it('pr_files present → no GitHub call, repoIntel called once with those files', async () => {
    const github = vi.fn();
    const getBlastRadius = vi.fn(async () => ({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
    }));
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => ['a.ts', 'b.ts']) }),
      repoIntel: makeRepoIntel(getBlastRadius),
      github,
    });
    await svc.get('ws1', 'pr1');
    expect(github).not.toHaveBeenCalled();
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('repo1', ['a.ts', 'b.ts']);
  });

  it('pr_files empty → getPullRequest called once, its file paths passed to getBlastRadius', async () => {
    const getPullRequest = vi.fn(async () => ({
      files: [{ path: 'x.ts', additions: 1, deletions: 0 }],
    }));
    const github = vi.fn(async () => ({ getPullRequest }) as unknown as GitHubClient);
    const getBlastRadius = vi.fn(async () => ({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
    }));
    const svc = new BlastService({
      repo: makeRepo(),
      repoIntel: makeRepoIntel(getBlastRadius),
      github,
    });
    await svc.get('ws1', 'pr1');
    expect(getPullRequest).toHaveBeenCalledTimes(1);
    expect(getPullRequest).toHaveBeenCalledWith({ owner: 'acme', name: 'payments-api' }, 8);
    expect(getBlastRadius).toHaveBeenCalledWith('repo1', ['x.ts']);
  });

  it('GitHub throws ConfigError → files_unavailable, getBlastRadius NOT called', async () => {
    const github = vi.fn(async () => {
      throw new ConfigError('no token');
    });
    const getBlastRadius = vi.fn();
    const svc = new BlastService({
      repo: makeRepo(),
      repoIntel: makeRepoIntel(getBlastRadius),
      github,
    });
    const blast = await svc.get('ws1', 'pr1');
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('files_unavailable');
    expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('an unknown PR → NotFoundError', async () => {
    const svc = new BlastService({
      repo: makeRepo({ getPullWithRepo: vi.fn(async () => undefined) }),
      repoIntel: makeRepoIntel(),
      github: vi.fn(),
    });
    await expect(svc.get('ws1', 'missing')).rejects.toThrow(NotFoundError);
  });
});

describe('BlastService.history', () => {
  it('ConfigError from github() → reason: no_github', async () => {
    const github = vi.fn(async () => {
      throw new ConfigError('no token');
    });
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => ['a.ts']) }),
      repoIntel: makeRepoIntel(),
      github,
    });
    const history = await svc.history('ws1', 'pr1');
    expect(history).toEqual({ history: [], reason: 'no_github' });
  });

  it('one path rejects, one resolves → partial history plus reason: github_error', async () => {
    const listMergedPullsForPath = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([
        { number: 5, title: 'Earlier fix', author: 'octocat', merged_at: '2026-01-01T00:00:00Z' },
      ]);
    const github = vi.fn(async () => ({ listMergedPullsForPath }) as unknown as GitHubClient);
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => ['a.ts', 'b.ts']) }),
      repoIntel: makeRepoIntel(),
      github,
    });
    const history = await svc.history('ws1', 'pr1');
    expect(history.reason).toBe('github_error');
    expect(history.history).toHaveLength(1);
    expect(history.history[0]!.pr_number).toBe(5);
  });

  it('calls listMergedPullsForPath at most MAX_HISTORY_PATHS times, each with maxCommits = MAX_COMMITS_PER_PATH', async () => {
    const listMergedPullsForPath = vi.fn(async () => []);
    const github = vi.fn(async () => ({ listMergedPullsForPath }) as unknown as GitHubClient);
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => Array.from({ length: 20 }, (_, i) => `f${i}.ts`)) }),
      repoIntel: makeRepoIntel(),
      github,
    });
    await svc.history('ws1', 'pr1');
    expect(listMergedPullsForPath).toHaveBeenCalledTimes(MAX_HISTORY_PATHS);
    for (const call of listMergedPullsForPath.mock.calls) {
      expect(call[2]).toEqual({ maxCommits: MAX_COMMITS_PER_PATH });
    }
  });

  it('no changed files (even after the GitHub fallback) → { history: [] }, listMergedPullsForPath never called', async () => {
    const listMergedPullsForPath = vi.fn(async () => []);
    const getPullRequest = vi.fn(async () => ({ files: [] }));
    const github = vi.fn(async () => ({ getPullRequest, listMergedPullsForPath }) as unknown as GitHubClient);
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => []) }),
      repoIntel: makeRepoIntel(),
      github,
    });
    const history = await svc.history('ws1', 'pr1');
    expect(history).toEqual({ history: [] });
    expect(listMergedPullsForPath).not.toHaveBeenCalled();
  });

  it('pr_files empty AND no GitHub token (via the resolveChangedFiles fallback) → reason: no_github', async () => {
    const github = vi.fn(async () => {
      throw new ConfigError('no token');
    });
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => []) }),
      repoIntel: makeRepoIntel(),
      github,
    });
    const history = await svc.history('ws1', 'pr1');
    expect(history).toEqual({ history: [], reason: 'no_github' });
  });

  it('pr_files empty AND a non-ConfigError GitHub failure (via the resolveChangedFiles fallback) → reason: github_error', async () => {
    const github = vi.fn(async () => {
      throw new Error('network down');
    });
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => []) }),
      repoIntel: makeRepoIntel(),
      github,
    });
    const history = await svc.history('ws1', 'pr1');
    expect(history).toEqual({ history: [], reason: 'github_error' });
  });

  it('a non-ConfigError failure from the direct github() call (after files resolved) → reason: github_error, not no_github', async () => {
    const github = vi.fn(async () => {
      throw new Error('network down');
    });
    const svc = new BlastService({
      repo: makeRepo({ getPrFilePaths: vi.fn(async () => ['a.ts']) }),
      repoIntel: makeRepoIntel(),
      github,
    });
    const history = await svc.history('ws1', 'pr1');
    expect(history).toEqual({ history: [], reason: 'github_error' });
  });
});
