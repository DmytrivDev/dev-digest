import type {
  CiRefreshResult,
  CiRunList,
  GitHubClient,
  RepoRef,
  WorkflowRunMeta,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentsRepository } from '../agents/repository.js';
import {
  CI_ARTIFACT_FILE,
  CI_ARTIFACT_MAX_BYTES,
  CI_ARTIFACT_NAME,
  CI_REFRESH_PER_PAGE,
} from './constants.js';
import { toRunDto } from './helpers/dto.js';
import { toGithubError } from './helpers/github-error.js';
import { checkArtifact, mapRun, workflowBasename, type ArtifactOutcome } from './helpers/ingest.js';
import type { CiRepository, WorkspaceInstallation } from './repository.js';

export interface CiIngestDeps {
  repo: CiRepository;
  agents: Pick<AgentsRepository, 'getById'>;
  github: () => Promise<GitHubClient>;
  /** Optional pino-like sink. Only repo names, statuses and messages are ever logged. */
  log?: { warn(obj: Record<string, unknown>, msg: string): void };
}

/**
 * Pulls workflow runs from GitHub into `agent_runs` (source='ci') + `ci_runs`.
 * Identity (repository id, SHA, PR number/title, run id/attempt, job URL) comes
 * from GitHub; the artifact only supplies counts, cost and the gate verdict
 * after it has been cross-checked (AC-31, AC-32).
 */
/** Octokit request errors carry a numeric HTTP `status`; DB / runtime errors do not. */
function isGithubShaped(err: unknown): boolean {
  return typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number';
}

export class CiIngestService {
  constructor(private readonly deps: CiIngestDeps) {}

  /** Never throws for a GitHub failure: it becomes an `errors[]` entry (AC-35). */
  async refresh(workspaceId: string): Promise<CiRefreshResult> {
    const result: CiRefreshResult = { ingested: 0, rejected: 0, failed: 0, running: 0, errors: [] };
    const installations = await this.deps.repo.workspaceInstallations(workspaceId);
    const titles = new Map<string, string | null>();

    for (const inst of installations) {
      try {
        await this.refreshInstallation(workspaceId, inst, titles, result);
      } catch (err) {
        // Only GitHub / app errors may surface their message; anything else (e.g. Postgres)
        // is logged server-side and reported generically.
        const isKnown = err instanceof AppError || isGithubShaped(err);
        const e = toGithubError(err);
        const status = (e.details as { status?: number | null } | undefined)?.status ?? null;
        const message = isKnown ? e.message : 'Internal error while ingesting this repository';
        this.deps.log?.warn({ repo: inst.fullName, status }, `ci refresh failed: ${message}`);
        result.errors.push({ repo: inst.fullName, status, message });
      }
    }
    return result;
  }

  async listRuns(workspaceId: string, agentId?: string): Promise<CiRunList> {
    if (agentId && !(await this.deps.agents.getById(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
    const rows = await this.deps.repo.listRuns(workspaceId, agentId);
    return {
      runs: rows.map((r) =>
        toRunDto(r.row, {
          repo: r.repoFullName,
          agentId: r.agentId,
          agentName: r.agentName,
          installedAt: r.installedAt,
        }),
      ),
    };
  }

  private async refreshInstallation(
    workspaceId: string,
    inst: WorkspaceInstallation,
    titles: Map<string, string | null>,
    result: CiRefreshResult,
  ): Promise<void> {
    const gh = await this.deps.github();
    const ref: RepoRef = { owner: inst.owner, name: inst.name };
    const runs = await gh.listWorkflowRuns(ref, workflowBasename(inst.workflowPath), {
      perPage: CI_REFRESH_PER_PAGE,
    });

    for (const run of runs) {
      const existing = await this.deps.repo.ciRunByRunId(inst.id, run.id);
      if (existing && existing.runAttempt === run.run_attempt && existing.status !== 'running') {
        continue;
      }

      // A fork author controls the workflow file under `pull_request`, so a fork run's
      // artifact is never trusted: stored as failed without downloading it (EC-3).
      if (run.head_repository_id !== null && run.head_repository_id !== run.repository_id) {
        const mapped = { ...mapRun(run, { ok: false, reason: 'absent' }), status: 'failed' as const, reason: 'fork' };
        await this.deps.repo.saveRun({
          workspaceId,
          agentId: inst.agentId,
          installationId: inst.id,
          existing: existing ? { ciRunId: existing.id, agentRunId: existing.agentRunId } : undefined,
          githubRunId: run.id,
          runAttempt: run.run_attempt,
          repositoryId: run.repository_id,
          commitSha: run.head_sha,
          prNumber: run.pr_numbers[0] ?? null,
          prTitle: null,
          jobUrl: run.html_url,
          ranAt: new Date(run.run_started_at ?? run.created_at),
          mapped,
        });
        result.ingested += 1;
        result.failed += 1;
        continue;
      }

      const prNumber = run.pr_numbers[0] ?? (await gh.findPullNumberForCommit(ref, run.head_sha));
      const outcome = run.status === 'completed' ? await this.readArtifact(gh, ref, run, prNumber) : null;
      const prTitle = prNumber === null ? null : await this.title(gh, ref, inst, prNumber, titles);
      const mapped = mapRun(run, outcome);

      await this.deps.repo.saveRun({
        workspaceId,
        agentId: inst.agentId,
        installationId: inst.id,
        existing: existing
          ? { ciRunId: existing.id, agentRunId: existing.agentRunId }
          : undefined,
        githubRunId: run.id,
        runAttempt: run.run_attempt,
        repositoryId: run.repository_id,
        commitSha: run.head_sha,
        prNumber,
        prTitle,
        jobUrl: run.html_url,
        ranAt: new Date(run.run_started_at ?? run.created_at),
        mapped,
      });

      // `ingested` counts every stored run; the other counters break it down by status.
      result.ingested += 1;
      if (mapped.status === 'rejected') result.rejected += 1;
      else if (mapped.status === 'failed') result.failed += 1;
      else if (mapped.status === 'running') result.running += 1;
    }
  }

  private async readArtifact(
    gh: GitHubClient,
    ref: RepoRef,
    run: WorkflowRunMeta,
    prNumber: number | null,
  ): Promise<ArtifactOutcome> {
    const artifact = await gh.downloadRunArtifact(ref, run.id, {
      artifactName: CI_ARTIFACT_NAME,
      fileName: CI_ARTIFACT_FILE,
      maxBytes: CI_ARTIFACT_MAX_BYTES,
    });
    if (artifact.status === 'absent') return { ok: false, reason: 'absent' };
    if (artifact.status === 'too_large') return { ok: false, reason: 'artifact_invalid' };
    return checkArtifact(artifact.text, run, prNumber);
  }

  /** PR title from GitHub, cached for one refresh; a failed lookup leaves it null. */
  private async title(
    gh: GitHubClient,
    ref: RepoRef,
    inst: WorkspaceInstallation,
    prNumber: number,
    cache: Map<string, string | null>,
  ): Promise<string | null> {
    const key = `${inst.fullName}#${prNumber}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    let title: string | null = null;
    try {
      title = await gh.getPullRequestTitle(ref, prNumber);
    } catch {
      title = null;
    }
    cache.set(key, title);
    return title;
  }
}
