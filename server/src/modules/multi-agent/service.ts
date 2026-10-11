import type {
  AgentColumn,
  AgentRunEstimates,
  AgentRunStatus,
  MultiAgentRun,
  MultiAgentRunList,
  MultiAgentRunStarted,
  ReviewRunTarget,
} from '@devdigest/shared';
import type { AgentRow } from '../../db/rows.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentsRepository } from '../agents/repository.js';
import { findingRowToDto } from '../reviews/helpers.js';
import type { ReviewRepository } from '../reviews/repository.js';
import type { Logger } from '../reviews/run-executor.js';
import { ESTIMATE_SAMPLE, RECENT_RUNS_LIMIT } from './constants.js';
import { buildGroups, estimateFrom, pickTargets, rollup } from './helpers.js';
import type { MultiAgentRepository } from './repository.js';

export interface MultiAgentDeps {
  repo: MultiAgentRepository;
  reviews: ReviewRepository;
  agents: AgentsRepository;
  /** Starts the agent runs of a set under a parent (`ReviewService.runReview`). */
  startRuns: (
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    parentId: string,
    logger?: Logger,
  ) => Promise<{ runs: ReviewRunTarget[] }>;
}

const RUN_STATUSES: readonly AgentRunStatus[] = ['running', 'done', 'failed', 'cancelled'];

function toStatus(raw: string | null): AgentRunStatus {
  return RUN_STATUSES.find((s) => s === raw) ?? 'running';
}

/**
 * Multi-agent review (SPEC-08). Starts one parent + one run per distinct agent
 * through the existing review executor, and composes the parent's columns,
 * groups and totals on read. Takes repositories, never the Container.
 */
export class MultiAgentService {
  constructor(private deps: MultiAgentDeps) {}

  /** `POST /pulls/:id/multi-agent-run`. Nothing is written before every check passes. */
  async start(
    workspaceId: string,
    prId: string,
    agentIds: readonly string[],
    logger?: Logger,
  ): Promise<MultiAgentRunStarted> {
    const { repo, reviews, agents, startRuns } = this.deps;
    const pull = await reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const picked = pickTargets(await agents.list(workspaceId), agentIds);
    if (picked.kind === 'missing') throw new NotFoundError('Agent not found');
    if (picked.kind === 'disabled') {
      throw new AppError('agent_disabled', 'One or more selected agents are disabled', 422);
    }

    const parent = await repo.createParent(workspaceId, prId);
    try {
      const { runs } = await startRuns(workspaceId, prId, picked.targets, parent.id, logger);
      return { id: parent.id, pr_id: prId, runs };
    } catch (err) {
      // No orphan parent, no child left `running` (children detach via ON DELETE SET NULL).
      const message = err instanceof Error ? err.message : String(err);
      await repo.abandonParent(workspaceId, parent.id, message);
      throw err;
    }
  }

  /** `GET /multi-agent-runs/:id`. Reads only; no finding row is written. */
  async get(workspaceId: string, id: string): Promise<MultiAgentRun> {
    const { repo, reviews } = this.deps;
    const parent = await repo.getParent(workspaceId, id);
    if (!parent) throw new NotFoundError('Multi-agent run not found');
    const pull = await reviews.getPull(workspaceId, parent.prId);
    const children = await repo.listChildren(workspaceId, parent.id);

    // Findings come only through each run's own review id (server/INSIGHTS.md:47).
    const found = await Promise.all(children.map((c) => reviews.reviewForRun(workspaceId, c.id)));
    const caseIds = await reviews.evalCaseIdsForFindings(
      found.flatMap((f) => f?.findings.map((row) => row.id) ?? []),
    );

    const columns: AgentColumn[] = children.map((c, i) => {
      const hit = found[i];
      return {
        run_id: c.id,
        agent_id: c.agentId,
        agent_name: c.agentName,
        provider: c.provider,
        model: c.model,
        status: toStatus(c.status),
        error: c.error,
        verdict: hit?.review.verdict ?? null,
        score: hit?.review.score ?? null,
        summary: hit?.review.summary ?? null,
        duration_ms: c.durationMs,
        cost_usd: c.costUsd,
        tokens_in: c.tokensIn,
        tokens_out: c.tokensOut,
        grounding: c.grounding,
        findings: (hit?.findings ?? []).map((row) =>
          findingRowToDto(row, {
            caseId: caseIds.get(row.id) ?? null,
            reviewAgentId: hit?.review.agentId ?? null,
            // `agentName` comes from a workspace-scoped join: null means the agent is gone.
            agentExists: c.agentName !== null,
          }),
        ),
      };
    });

    const totals = rollup(
      parent.ranAt,
      children.map((c, i) => ({
        status: columns[i]!.status,
        ranAt: c.ranAt,
        durationMs: c.durationMs,
        costUsd: c.costUsd,
      })),
    );

    return {
      id: parent.id,
      pr_id: parent.prId,
      pr_number: pull?.number ?? null,
      pr_title: pull?.title ?? null,
      repo_id: pull?.repoId ?? null,
      ran_at: parent.ranAt.toISOString(),
      status: totals.status,
      agent_count: columns.length,
      total_duration_ms: totals.total_duration_ms,
      total_cost_usd: totals.total_cost_usd,
      columns,
      groups: buildGroups(columns),
    };
  }

  /** `GET /pulls/:id/multi-agent-runs`. The PR must belong to the workspace (404 otherwise). */
  async recent(workspaceId: string, prId: string): Promise<MultiAgentRunList> {
    const { repo, reviews } = this.deps;
    const pull = await reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const parents = await repo.listParentsForPr(workspaceId, prId, RECENT_RUNS_LIMIT);
    const children = await repo.listChildrenForParents(
      workspaceId,
      parents.map((p) => p.id),
    );

    return {
      runs: parents.map((p) => {
        const mine = children.filter((c) => c.parentId === p.id);
        const totals = rollup(
          p.ranAt,
          mine.map((c) => ({
            status: toStatus(c.status),
            ranAt: c.ranAt,
            durationMs: c.durationMs,
            costUsd: c.costUsd,
          })),
        );
        return {
          id: p.id,
          ran_at: p.ranAt.toISOString(),
          status: totals.status,
          agent_count: mine.length,
          total_duration_ms: totals.total_duration_ms,
          total_cost_usd: totals.total_cost_usd,
        };
      }),
    };
  }

  /** `GET /agents/run-estimates`. Every id must belong to the workspace. */
  async estimates(workspaceId: string, agentIds: readonly string[]): Promise<AgentRunEstimates> {
    const { repo, agents } = this.deps;
    const known = new Set((await agents.list(workspaceId)).map((a) => a.id));
    const ids = [...new Set(agentIds)];
    if (ids.some((id) => !known.has(id))) throw new NotFoundError('Agent not found');

    const estimates = await Promise.all(
      ids.map(async (id) =>
        estimateFrom(id, await repo.doneRunsForEstimate(workspaceId, id, ESTIMATE_SAMPLE)),
      ),
    );
    return { estimates };
  }
}
