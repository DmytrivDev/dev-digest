import type { AgentPerf, AgentPerfRow, AgentStats, PerfWindowQuery } from '@devdigest/shared';
import { COST_BASIS, MIN_DECISIONS } from './constants.js';
import {
  buildAgentRows,
  costByAgent,
  costByModel,
  summarize,
  type PerfRunInput,
} from './helpers/aggregate.js';
import { resolveWindow, windowDto, type ResolvedWindow } from './helpers/window.js';
import type { AgentPerformanceRepository } from './repository.js';

/**
 * Agent Performance use cases. Both endpoints go through `rowsFor`, so a
 * dashboard row and the Stats tab's `agent` are the same computation (AC-14).
 * No cache (AC-13), no write, no job, no LLM (AC-28).
 */
export class AgentPerformanceService {
  constructor(
    private readonly repo: AgentPerformanceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async rowsFor(
    workspaceId: string,
    window: ResolvedWindow,
    agentId?: string,
  ): Promise<{ rows: AgentPerfRow[]; runs: PerfRunInput[] }> {
    const [agents, runs, counts, lastRuns] = await Promise.all([
      this.repo.listAgents(workspaceId, agentId),
      this.repo.runsInWindow(workspaceId, window.from, window.to, agentId),
      this.repo.findingCountsByRun(workspaceId, window.from, window.to, agentId),
      this.repo.lastDoneRunAt(workspaceId, agentId),
    ]);
    return { rows: buildAgentRows(agents, runs, counts, lastRuns), runs };
  }

  async performance(workspaceId: string, q: PerfWindowQuery): Promise<AgentPerf> {
    const window = resolveWindow(q, this.now());
    const { rows, runs } = await this.rowsFor(workspaceId, window);
    return {
      window: windowDto(window),
      cost_basis: COST_BASIS,
      min_decisions: MIN_DECISIONS,
      summary: summarize(rows),
      agents: rows,
      cost_by_agent: costByAgent(rows),
      cost_by_model: costByModel(runs),
    };
  }

  /** `undefined` for an unknown or foreign agent: the two are indistinguishable (AC-27). */
  async stats(workspaceId: string, agentId: string, q: PerfWindowQuery): Promise<AgentStats | undefined> {
    const window = resolveWindow(q, this.now());
    const { rows } = await this.rowsFor(workspaceId, window, agentId);
    const agent = rows[0];
    if (!agent) return undefined;
    return {
      window: windowDto(window),
      cost_basis: COST_BASIS,
      min_decisions: MIN_DECISIONS,
      agent,
    };
  }
}
