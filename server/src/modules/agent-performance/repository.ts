import { and, asc, eq, gte, inArray, isNotNull, lt, max, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { COUNTED_STATUS, FAILED_STATUSES } from './constants.js';
import type {
  PerfAgentInput,
  PerfFindingCounts,
  PerfLastRun,
  PerfRunInput,
} from './helpers/aggregate.js';

/**
 * Agent Performance data-access. READ-ONLY: it never inserts, updates or
 * deletes (AC-28). Every method is scoped by `workspaceId`.
 *
 * Findings have no `workspace_id` of their own, so they are reached only
 * through `reviews.workspace_id = ws` AND `agent_runs.workspace_id = ws`
 * (AC-26; `server/INSIGHTS.md` findings-tenancy entry). What counts as a run
 * is NOT decided here: the statuses are fetched, `isCountedRun` decides.
 */
export class AgentPerformanceRepository {
  constructor(private readonly db: Db) {}

  /** Agents of the workspace (or the one named), enabled or not. */
  async listAgents(workspaceId: string, agentId?: string): Promise<PerfAgentInput[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agents)
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          agentId !== undefined ? eq(t.agents.id, agentId) : undefined,
        ),
      )
      .orderBy(asc(t.agents.name), asc(t.agents.id));
    return rows;
  }

  /** Runs of agents whose `ran_at` is inside `[from, to)`. */
  async runsInWindow(
    workspaceId: string,
    from: Date,
    to: Date,
    agentId?: string,
  ): Promise<PerfRunInput[]> {
    const rows = await this.db
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        ranAt: t.agentRuns.ranAt,
        status: t.agentRuns.status,
        source: t.agentRuns.source,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        model: t.agentRuns.model,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          agentId !== undefined ? eq(t.agentRuns.agentId, agentId) : isNotNull(t.agentRuns.agentId),
          gte(t.agentRuns.ranAt, from),
          lt(t.agentRuns.ranAt, to),
          inArray(t.agentRuns.status, [COUNTED_STATUS, ...FAILED_STATUSES]),
        ),
      );
    return rows.flatMap((r) => (r.agentId === null ? [] : [{ ...r, agentId: r.agentId }]));
  }

  /** Finding totals and decisions per run, for runs inside the window. */
  async findingCountsByRun(
    workspaceId: string,
    from: Date,
    to: Date,
    agentId?: string,
  ): Promise<PerfFindingCounts[]> {
    const rows = await this.db
      .select({
        runId: t.reviews.runId,
        findings: sql<number>`count(*)::int`,
        accepted: sql<number>`count(${t.findings.acceptedAt})::int`,
        dismissed: sql<number>`count(${t.findings.dismissedAt})::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.agentRuns.workspaceId, workspaceId),
          agentId !== undefined ? eq(t.agentRuns.agentId, agentId) : isNotNull(t.agentRuns.agentId),
          gte(t.agentRuns.ranAt, from),
          lt(t.agentRuns.ranAt, to),
        ),
      )
      .groupBy(t.reviews.runId);
    return rows.flatMap((r) => (r.runId === null ? [] : [{ ...r, runId: r.runId }]));
  }

  /** Newest `done` run per agent at ANY time (AC-11). */
  async lastDoneRunAt(workspaceId: string, agentId?: string): Promise<PerfLastRun[]> {
    const rows = await this.db
      .select({ agentId: t.agentRuns.agentId, lastRunAt: max(t.agentRuns.ranAt) })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, COUNTED_STATUS),
          agentId !== undefined ? eq(t.agentRuns.agentId, agentId) : isNotNull(t.agentRuns.agentId),
        ),
      )
      .groupBy(t.agentRuns.agentId);
    return rows.flatMap((r) =>
      r.agentId === null || r.lastRunAt === null ? [] : [{ agentId: r.agentId, lastRunAt: r.lastRunAt }],
    );
  }
}
