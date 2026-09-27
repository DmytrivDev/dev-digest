import type { BlastRadius, GitHubClient, PathPullRequest, PrHistory } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import type { BlastPullRow, BlastRepository } from './repository.js';
import { buildPrHistory, emptyBlastRadius, pickHistoryPaths, toBlastRadius } from './helpers.js';
import {
  HISTORY_DEADLINE_MS,
  MAX_COMMITS_PER_PATH,
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_PATHS,
} from './constants.js';

export interface BlastServiceDeps {
  repo: BlastRepository;
  repoIntel: Pick<RepoIntel, 'getBlastRadius' | 'getFileRank'>;
  /** `container.github` — async because the client is built from a stored token. */
  github: () => Promise<GitHubClient>;
}

/** `resolveChangedFiles`'s result — `githubUnavailable` is only ever true when
 *  `files` came back empty (see Key decision 3). `unavailableReason`
 *  distinguishes "no token" from any other GitHub failure, so `history()`
 *  can report `no_github` vs `github_error` even on this empty-files path. */
export interface ResolvedChangedFiles {
  files: string[];
  githubUnavailable: boolean;
  unavailableReason?: 'no_github' | 'github_error';
}

/**
 * Blast service. Takes ports and a repository, never the DI composition root
 * (`server/INSIGHTS.md:40`) — composition happens in `blast/routes.ts`.
 */
export class BlastService {
  constructor(private deps: BlastServiceDeps) {}

  /**
   * `GET /pulls/:id/blast`. Reads `pr_files` first; when a PR has never been
   * opened in DevDigest (`pr_files` is empty), makes exactly ONE GitHub call
   * to resolve the changed files, and does not persist them (`pulls/routes.ts`
   * owns that table). Calls `repoIntel.getBlastRadius` exactly once.
   */
  async get(workspaceId: string, prId: string): Promise<BlastRadius> {
    const pull = await this.deps.repo.getPullWithRepo(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const { files, githubUnavailable } = await this.resolveChangedFiles(pull);
    if (files.length === 0) {
      if (githubUnavailable) return emptyBlastRadius('files_unavailable');
      return toBlastRadius({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: false,
      });
    }

    const result = await this.deps.repoIntel.getBlastRadius(pull.repoId, files);
    return toBlastRadius(result);
  }

  /**
   * Resolves the PR's changed file paths: `pr_files` first, one GitHub call
   * when that is empty. Never writes `pr_files` — that transaction belongs to
   * `pulls/routes.ts`. Exposed (not truly private) so `history()` (W9) can
   * reuse it.
   */
  protected async resolveChangedFiles(pull: BlastPullRow): Promise<ResolvedChangedFiles> {
    const stored = await this.deps.repo.getPrFilePaths(pull.prId);
    if (stored.length > 0) return { files: stored, githubUnavailable: false };

    try {
      const github = await this.deps.github();
      const detail = await github.getPullRequest(
        { owner: pull.owner, name: pull.name },
        pull.number,
      );
      return { files: detail.files.map((f) => f.path), githubUnavailable: false };
    } catch (err) {
      // ConfigError (no token) or any other GitHub failure — degrade, never 5xx.
      return {
        files: [],
        githubUnavailable: true,
        unavailableReason: err instanceof ConfigError ? 'no_github' : 'github_error',
      };
    }
  }

  /**
   * `GET /pulls/:id/history`. Picks up to `MAX_HISTORY_PATHS` of the PR's
   * changed files (highest-ranked first), then makes at most
   * `MAX_HISTORY_PATHS * (1 + MAX_COMMITS_PER_PATH)` read-only GitHub REST
   * calls total, bounded by `HISTORY_DEADLINE_MS`. Never 5xxs: no token or a
   * total GitHub failure both come back as a 200 with `reason` set.
   */
  async history(workspaceId: string, prId: string): Promise<PrHistory> {
    const pull = await this.deps.repo.getPullWithRepo(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const { files, githubUnavailable, unavailableReason } = await this.resolveChangedFiles(pull);
    if (files.length === 0) {
      if (githubUnavailable) return { history: [], reason: unavailableReason ?? 'github_error' };
      return { history: [] };
    }

    const ranks = await this.deps.repoIntel.getFileRank(pull.repoId, files);
    const paths = pickHistoryPaths(files, ranks, MAX_HISTORY_PATHS);

    let github: GitHubClient;
    try {
      github = await this.deps.github();
    } catch (err) {
      return { history: [], reason: err instanceof ConfigError ? 'no_github' : 'github_error' };
    }

    type PathResult = { path: string; pulls: PathPullRequest[] };
    let settled: PromiseSettledResult<PathResult>[];
    try {
      settled = await withTimeout(
        Promise.allSettled(
          paths.map(async (path): Promise<PathResult> => {
            const pulls = await github.listMergedPullsForPath(
              { owner: pull.owner, name: pull.name },
              path,
              { maxCommits: MAX_COMMITS_PER_PATH },
            );
            return { path, pulls };
          }),
        ),
        HISTORY_DEADLINE_MS,
      );
    } catch {
      return { history: [], reason: 'github_error' };
    }

    const perPath: PathResult[] = [];
    let anyFailed = false;
    for (const r of settled) {
      if (r.status === 'fulfilled') perPath.push(r.value);
      else anyFailed = true;
    }

    if (perPath.length === 0 && anyFailed) return { history: [], reason: 'github_error' };

    const history = buildPrHistory(
      perPath,
      pull.number,
      pull.openedAt ? pull.openedAt.toISOString() : null,
      MAX_HISTORY_ITEMS,
    );
    const result: PrHistory = { history };
    if (anyFailed) result.reason = 'github_error';
    return result;
  }
}
