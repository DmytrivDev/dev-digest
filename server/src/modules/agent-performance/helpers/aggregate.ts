import type {
  AgentPerfRow,
  PerfAgentCost,
  PerfModelCost,
  PerfMostActive,
  PerfSummary,
} from '@devdigest/shared';
import {
  COUNTED_STATUS,
  FAILED_STATUSES,
  MAX_VALID_COST_USD,
  MIN_DECISIONS,
  RECENT_RUNS_LIMIT,
} from '../constants.js';

/**
 * The ONE aggregation rule behind both endpoints (AC-14 by construction).
 * Pure: no db, no clock. The repository maps its rows into these plain shapes.
 */

export interface PerfAgentInput {
  id: string;
  name: string;
  enabled: boolean;
}

export interface PerfRunInput {
  id: string;
  agentId: string;
  ranAt: Date;
  status: string | null;
  source: 'local' | 'ci';
  durationMs: number | null;
  costUsd: number | null;
  model: string | null;
}

/** Findings of one run's reviews, counted as `skillStatsFrom` does. */
export interface PerfFindingCounts {
  runId: string;
  findings: number;
  accepted: number;
  dismissed: number;
}

export interface PerfLastRun {
  agentId: string;
  lastRunAt: Date;
}

/** AC-3: null, negative, non-finite or above the bound is unpriced. */
export function validCostUsd(c: number | null | undefined): number | null {
  if (c === null || c === undefined) return null;
  if (!Number.isFinite(c) || c < 0 || c > MAX_VALID_COST_USD) return null;
  return c;
}

/** The single counted-run predicate (AC-1). */
export function isCountedRun(r: Pick<PerfRunInput, 'status'>): boolean {
  return r.status === COUNTED_STATUS;
}

function isFailedRun(r: Pick<PerfRunInput, 'status'>): boolean {
  return (FAILED_STATUSES as readonly (string | null)[]).includes(r.status);
}

/** AC-9. Null, never 0, when nothing was decided. */
export function acceptRate(accepted: number, dismissed: number): number | null {
  const decided = accepted + dismissed;
  return decided === 0 ? null : accepted / decided;
}

/** AC-10. */
export function isSmallSample(accepted: number, dismissed: number): boolean {
  const decided = accepted + dismissed;
  return decided >= 1 && decided < MIN_DECISIONS;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildAgentRow(
  agent: PerfAgentInput,
  runsOfAgent: readonly PerfRunInput[],
  countsByRunId: ReadonlyMap<string, PerfFindingCounts>,
  lastRunAt: Date | null,
): AgentPerfRow {
  const counted = runsOfAgent.filter(isCountedRun);
  const failed = runsOfAgent.filter(isFailedRun);

  const costs = counted.map((r) => validCostUsd(r.costUsd)).filter((c): c is number => c !== null);
  const pricedRuns = costs.length;
  const totalCost = pricedRuns === 0 ? null : costs.reduce((s, c) => s + c, 0);

  const durations = counted.map((r) => r.durationMs).filter((d): d is number => d !== null);
  const avgDuration =
    durations.length === 0 ? null : durations.reduce((s, d) => s + d, 0) / durations.length;

  // Findings only through counted runs: a failed run's review adds nothing (AC-8).
  let findings = 0;
  let accepted = 0;
  let dismissed = 0;
  for (const r of counted) {
    const c = countsByRunId.get(r.id);
    if (!c) continue;
    findings += c.findings;
    accepted += c.accepted;
    dismissed += c.dismissed;
  }

  const recent = [...counted]
    .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime() || cmp(a.id, b.id))
    .slice(0, RECENT_RUNS_LIMIT)
    .map((r) => ({
      run_id: r.id,
      ran_at: r.ranAt.toISOString(),
      source: r.source,
      duration_ms: r.durationMs,
      cost_usd: validCostUsd(r.costUsd),
    }));

  return {
    agent_id: agent.id,
    agent_name: agent.name,
    enabled: agent.enabled,
    runs: counted.length,
    failed_runs: failed.length,
    priced_runs: pricedRuns,
    total_cost_usd: totalCost,
    avg_cost_usd: totalCost === null ? null : totalCost / pricedRuns,
    avg_duration_ms: avgDuration,
    findings,
    accepted,
    dismissed,
    accept_rate: acceptRate(accepted, dismissed),
    small_sample: isSmallSample(accepted, dismissed),
    last_run_at: lastRunAt ? lastRunAt.toISOString() : null,
    recent_runs: recent,
  };
}

/** One row per agent (AC-18), in the order the agents were given. */
export function buildAgentRows(
  agents: readonly PerfAgentInput[],
  runs: readonly PerfRunInput[],
  counts: readonly PerfFindingCounts[],
  lastRuns: readonly PerfLastRun[],
): AgentPerfRow[] {
  const countsByRunId = new Map(counts.map((c) => [c.runId, c]));
  const lastByAgent = new Map(lastRuns.map((l) => [l.agentId, l.lastRunAt]));
  const runsByAgent = new Map<string, PerfRunInput[]>();
  for (const r of runs) {
    const list = runsByAgent.get(r.agentId);
    if (list) list.push(r);
    else runsByAgent.set(r.agentId, [r]);
  }
  return agents.map((a) =>
    buildAgentRow(a, runsByAgent.get(a.id) ?? [], countsByRunId, lastByAgent.get(a.id) ?? null),
  );
}

/** AC-24. Plain `<` on the lower-cased name, not `localeCompare`, which varies by ICU. */
export function pickMostActive(rows: readonly AgentPerfRow[]): PerfMostActive | null {
  const candidates = rows.filter((r) => r.runs > 0);
  if (candidates.length === 0) return null;
  const newest = (r: AgentPerfRow) => r.recent_runs[0]?.ran_at ?? '';
  const best = [...candidates].sort((a, b) => {
    if (a.runs !== b.runs) return b.runs - a.runs;
    const byNewest = cmp(newest(b), newest(a));
    if (byNewest !== 0) return byNewest;
    const byName = cmp(a.agent_name.toLowerCase(), b.agent_name.toLowerCase());
    if (byName !== 0) return byName;
    return cmp(a.agent_id, b.agent_id);
  })[0]!;
  return { agent_id: best.agent_id, agent_name: best.agent_name, runs: best.runs };
}

/** AC-19, AC-20, AC-23. The rate is pooled over decisions, never a mean of rates. */
export function summarize(rows: readonly AgentPerfRow[]): PerfSummary {
  const totals = rows.map((r) => r.total_cost_usd).filter((c): c is number => c !== null);
  const accepted = rows.reduce((s, r) => s + r.accepted, 0);
  const dismissed = rows.reduce((s, r) => s + r.dismissed, 0);
  return {
    runs: rows.reduce((s, r) => s + r.runs, 0),
    failed_runs: rows.reduce((s, r) => s + r.failed_runs, 0),
    priced_runs: rows.reduce((s, r) => s + r.priced_runs, 0),
    total_cost_usd: totals.length === 0 ? null : totals.reduce((s, c) => s + c, 0),
    accepted,
    dismissed,
    accept_rate: acceptRate(accepted, dismissed),
    small_sample: isSmallSample(accepted, dismissed),
    most_active: pickMostActive(rows),
  };
}

/** AC-21. */
export function costByAgent(rows: readonly AgentPerfRow[]): PerfAgentCost[] {
  return rows
    .filter((r) => r.priced_runs >= 1 && r.total_cost_usd !== null)
    .map((r) => ({ agent_id: r.agent_id, agent_name: r.agent_name, cost_usd: r.total_cost_usd! }))
    .sort((a, b) => {
      if (a.cost_usd !== b.cost_usd) return b.cost_usd - a.cost_usd;
      return cmp(a.agent_name.toLowerCase(), b.agent_name.toLowerCase()) || cmp(a.agent_id, b.agent_id);
    });
}

/** AC-22. `model: null` is its own segment; `runs` counts priced runs in the segment. */
export function costByModel(runs: readonly PerfRunInput[]): PerfModelCost[] {
  const byModel = new Map<string | null, { cost: number; runs: number }>();
  for (const r of runs) {
    if (!isCountedRun(r)) continue;
    const cost = validCostUsd(r.costUsd);
    if (cost === null) continue;
    const seg = byModel.get(r.model) ?? { cost: 0, runs: 0 };
    seg.cost += cost;
    seg.runs += 1;
    byModel.set(r.model, seg);
  }
  return [...byModel.entries()]
    .map(([model, seg]) => ({ model, cost_usd: seg.cost, runs: seg.runs }))
    .sort((a, b) => {
      if (a.cost_usd !== b.cost_usd) return b.cost_usd - a.cost_usd;
      if (a.model === b.model) return 0;
      if (a.model === null) return 1;
      if (b.model === null) return -1;
      return cmp(a.model, b.model);
    });
}
