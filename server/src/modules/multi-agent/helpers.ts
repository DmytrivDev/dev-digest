import type {
  AgentColumn,
  AgentRunEstimate,
  AgentRunStatus,
  FindingGroup,
  FindingRecord,
  FindingTake,
  Severity,
} from '@devdigest/shared';
import { findingMatches } from '../eval/helpers/scoring.js';

/**
 * Pure multi-agent rules (SPEC-08): target selection, estimates, the parent's
 * roll-up, finding groups and takes. Ring 1: no I/O, type imports only (plus
 * the eval overlap rule). The file name keeps `core-not-to-io` watching it.
 */

// ---------------------------------------------------------------- target selection (AC-12, 14, 15)

export type PickTargetsResult<A> =
  | { kind: 'missing' }
  | { kind: 'disabled' }
  | { kind: 'ok'; targets: A[] };

/**
 * Resolve the requested ids against the workspace's agents. Duplicates collapse
 * and the result keeps the agents-list order. Membership is checked before
 * `enabled`, so an unknown id is `missing` even next to a disabled one.
 */
export function pickTargets<A extends { id: string; enabled: boolean }>(
  agentsInListOrder: readonly A[],
  requestedIds: readonly string[],
): PickTargetsResult<A> {
  const known = new Set(agentsInListOrder.map((a) => a.id));
  const wanted = new Set(requestedIds);
  for (const id of wanted) if (!known.has(id)) return { kind: 'missing' };
  const targets = agentsInListOrder.filter((a) => wanted.has(a.id));
  if (targets.some((a) => !a.enabled)) return { kind: 'disabled' };
  return { kind: 'ok', targets };
}

// ---------------------------------------------------------------- estimates (AC-11)

export interface EstimateRow {
  durationMs: number | null;
  costUsd: number | null;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Average of an agent's newest done runs (`rows` are newest-first, at most the sample size). */
export function estimateFrom(agentId: string, rows: readonly EstimateRow[]): AgentRunEstimate {
  const durations = rows.flatMap((r) => (r.durationMs === null ? [] : [r.durationMs]));
  const costs = rows.flatMap((r) => (r.costUsd === null ? [] : [r.costUsd]));
  const avgDuration = average(durations);
  return {
    agent_id: agentId,
    runs_sampled: rows.length,
    avg_duration_ms: avgDuration === null ? null : Math.round(avgDuration),
    avg_cost_usd: average(costs),
  };
}

// ---------------------------------------------------------------- roll-up (AC-21)

export interface RollupChild {
  status: AgentRunStatus;
  ranAt: Date;
  durationMs: number | null;
  costUsd: number | null;
}

export interface Rollup {
  status: 'running' | 'done';
  total_duration_ms: number | null;
  total_cost_usd: number | null;
}

export function rollup(parentRanAt: Date, children: readonly RollupChild[]): Rollup {
  const running = children.some((c) => c.status === 'running');

  let totalDuration: number | null = null;
  if (!running && children.length > 0) {
    const latestFinish = Math.max(...children.map((c) => c.ranAt.getTime() + (c.durationMs ?? 0)));
    totalDuration = Math.max(0, Math.round(latestFinish - parentRanAt.getTime()));
  }

  const done = children.filter((c) => c.status === 'done');
  const totalCost =
    done.length === 0 || done.some((c) => c.costUsd === null)
      ? null
      : done.reduce((sum, c) => sum + (c.costUsd as number), 0);

  return {
    status: running ? 'running' : 'done',
    total_duration_ms: totalDuration,
    total_cost_usd: totalCost,
  };
}

// ---------------------------------------------------------------- groups, takes, conflicts (AC-23..25)

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

interface Member {
  finding: FindingRecord;
  column: number;
}

/** Highest severity wins; on a tie the member that starts first, then the earlier column. */
function strongest(members: readonly Member[]): Member {
  return members.reduce((best, m) => {
    const diff = SEVERITY_RANK[m.finding.severity] - SEVERITY_RANK[best.finding.severity];
    if (diff !== 0) return diff > 0 ? m : best;
    return m.finding.start_line < best.finding.start_line ? m : best;
  });
}

/** Group the findings of the done columns by file + transitive line overlap. */
function clusterMembers(columns: readonly AgentColumn[]): Member[][] {
  const members: Member[] = [];
  columns.forEach((col, column) => {
    if (col.status !== 'done') return;
    for (const finding of col.findings) members.push({ finding, column });
  });

  const byFile = new Map<string, Member[]>();
  for (const m of members) {
    const list = byFile.get(m.finding.file);
    if (list) list.push(m);
    else byFile.set(m.finding.file, [m]);
  }

  const clusters: Member[][] = [];
  for (const list of byFile.values()) {
    // Union-find over `findingMatches`, so the overlap rule stays the eval one.
    const parent = list.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]!]!;
        i = parent[i]!;
      }
      return i;
    };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (findingMatches(list[i]!.finding, list[j]!.finding)) parent[find(i)] = find(j);
      }
    }
    const roots = new Map<number, Member[]>();
    list.forEach((m, i) => {
      const root = find(i);
      const cluster = roots.get(root);
      if (cluster) cluster.push(m);
      else roots.set(root, [m]);
    });
    clusters.push(...roots.values());
  }
  return clusters;
}

function takeFor(col: AgentColumn, index: number, members: readonly Member[]): FindingTake {
  const base = { run_id: col.run_id, agent_id: col.agent_id, agent_name: col.agent_name };
  const mine = members.filter((m) => m.column === index);
  if (mine.length > 0) {
    const top = strongest(mine).finding;
    return {
      ...base,
      state: 'flagged',
      severity: top.severity,
      note: top.title,
      finding_ids: mine.map((m) => m.finding.id),
    };
  }
  const state =
    col.status === 'done'
      ? 'did_not_flag'
      : col.status === 'running'
        ? 'pending'
        : col.status; // 'failed' | 'cancelled'
  return { ...base, state, severity: null, note: null, finding_ids: [] };
}

/** AC-25: a conflict needs two finished agents and a split among the finished takes. */
export function isConflict(takes: readonly FindingTake[]): boolean {
  const flagged = takes.filter((t) => t.state === 'flagged');
  const ignored = takes.filter((t) => t.state === 'did_not_flag');
  if (flagged.length + ignored.length < 2) return false;
  if (flagged.length >= 1 && ignored.length >= 1) return true;
  return new Set(flagged.map((t) => t.severity)).size > 1;
}

export function buildGroups(columns: readonly AgentColumn[]): FindingGroup[] {
  const groups = clusterMembers(columns).map((members): FindingGroup => {
    const file = members[0]!.finding.file;
    const line = Math.min(...members.map((m) => m.finding.start_line));
    const takes = columns.map((col, i) => takeFor(col, i, members));
    return {
      id: `${file}:${line}`,
      file,
      line,
      title: strongest(members).finding.title,
      is_conflict: isConflict(takes),
      takes,
    };
  });
  return groups.sort(
    (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line,
  );
}
