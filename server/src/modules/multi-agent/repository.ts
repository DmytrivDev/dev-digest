import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Multi-agent data access (SPEC-08). Every query is filtered by `workspace_id`,
 * so an id from another workspace matches nothing. Findings are NOT read here:
 * the service reaches them only through each run's own review id
 * (`ReviewRepository.reviewForRun`, server/INSIGHTS.md:47).
 */

export interface ParentRow {
  id: string;
  prId: string;
  ranAt: Date;
}

export interface RollupChildRow {
  parentId: string | null;
  status: string | null;
  ranAt: Date;
  durationMs: number | null;
  costUsd: number | null;
}

export interface ChildRow {
  id: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  error: string | null;
  ranAt: Date;
  durationMs: number | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  grounding: string | null;
}

export class MultiAgentRepository {
  constructor(private db: Db) {}

  async createParent(workspaceId: string, prId: string): Promise<{ id: string; ranAt: Date }> {
    const [row] = await this.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId })
      .returning({ id: t.multiAgentRuns.id, ranAt: t.multiAgentRuns.ranAt });
    return row!;
  }

  /** Rolls back a start that failed midway: fails the parent's children, drops the parent. */
  async abandonParent(workspaceId: string, id: string, error: string): Promise<void> {
    await this.db
      .update(t.agentRuns)
      .set({ status: 'failed', error })
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.multiAgentRunId, id),
          eq(t.agentRuns.status, 'running'),
        ),
      );
    await this.db
      .delete(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
  }

  async getParent(workspaceId: string, id: string): Promise<ParentRow | undefined> {
    const [row] = await this.db
      .select({ id: t.multiAgentRuns.id, prId: t.multiAgentRuns.prId, ranAt: t.multiAgentRuns.ranAt })
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
    return row;
  }

  /** A PR's newest parents, newest `ran_at` first. */
  listParentsForPr(workspaceId: string, prId: string, limit: number): Promise<ParentRow[]> {
    return this.db
      .select({ id: t.multiAgentRuns.id, prId: t.multiAgentRuns.prId, ranAt: t.multiAgentRuns.ranAt })
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(limit);
  }

  /** The roll-up inputs of every child of the given parents (one query). */
  listChildrenForParents(workspaceId: string, parentIds: readonly string[]): Promise<RollupChildRow[]> {
    if (parentIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        parentId: t.agentRuns.multiAgentRunId,
        status: t.agentRuns.status,
        ranAt: t.agentRuns.ranAt,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.multiAgentRunId, [...parentIds]),
        ),
      );
  }

  /** The parent's agent runs in creation order (= agents-list order at start). */
  listChildren(workspaceId: string, parentId: string): Promise<ChildRow[]> {
    return this.db
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
        provider: t.agentRuns.provider,
        model: t.agentRuns.model,
        status: t.agentRuns.status,
        error: t.agentRuns.error,
        ranAt: t.agentRuns.ranAt,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        grounding: t.agentRuns.grounding,
      })
      .from(t.agentRuns)
      .leftJoin(
        t.agents,
        and(eq(t.agents.id, t.agentRuns.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(
        and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.multiAgentRunId, parentId)),
      )
      .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
  }

  /** An agent's newest `done` runs, newest first. */
  doneRunsForEstimate(
    workspaceId: string,
    agentId: string,
    limit: number,
  ): Promise<{ durationMs: number | null; costUsd: number | null }[]> {
    return this.db
      .select({ durationMs: t.agentRuns.durationMs, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(limit);
  }
}
