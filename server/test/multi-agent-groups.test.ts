/**
 * Multi-agent finding groups (SPEC-08 AC-23..25) — pure, no database, no model.
 * Covers `buildGroups` (clustering by file + transitive line overlap, takes,
 * group title/line/order) and `isConflict`.
 */
import { describe, it, expect } from 'vitest';
import type { AgentColumn, AgentRunStatus, FindingRecord, FindingTake, Severity } from '@devdigest/shared';
import { buildGroups, isConflict } from '../src/modules/multi-agent/helpers.js';

let seq = 0;

function finding(
  file: string,
  start: number,
  end: number,
  severity: Severity = 'WARNING',
  title = `${file}:${start}-${end}`,
): FindingRecord {
  seq += 1;
  return {
    id: `f${seq}`,
    severity,
    category: 'bug',
    title,
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
    confidence: 0.9,
    review_id: 'rev',
    accepted_at: null,
    dismissed_at: null,
  };
}

function column(name: string, findings: FindingRecord[], status: AgentRunStatus = 'done'): AgentColumn {
  return {
    run_id: `run-${name}`,
    agent_id: `agent-${name}`,
    agent_name: name,
    provider: null,
    model: null,
    status,
    error: null,
    verdict: null,
    score: null,
    summary: null,
    duration_ms: null,
    cost_usd: null,
    tokens_in: null,
    tokens_out: null,
    grounding: null,
    findings,
  };
}

const states = (takes: FindingTake[]) => takes.map((t) => t.state);

describe('buildGroups — clustering', () => {
  it('returns no groups when no done column has findings', () => {
    expect(buildGroups([])).toEqual([]);
    expect(buildGroups([column('a', []), column('b', [])])).toEqual([]);
  });

  it('merges overlapping findings of different agents into one group', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 10, 20)]),
      column('b', [finding('src/x.ts', 15, 25)]),
    ]);
    expect(groups).toHaveLength(1);
    expect(states(groups[0]!.takes)).toEqual(['flagged', 'flagged']);
  });

  it('treats a shared boundary line as overlap (inclusive ranges)', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 5)]),
      column('b', [finding('src/x.ts', 5, 9)]),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('keeps adjacent but non-overlapping ranges apart', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 5)]),
      column('b', [finding('src/x.ts', 6, 9)]),
    ]);
    expect(groups.map((g) => g.line)).toEqual([1, 6]);
  });

  it('chains overlap transitively: A~B and B~C put A and C in one group', () => {
    // 1-5 and 10-15 do not touch; 5-10 bridges them.
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 5), finding('src/x.ts', 10, 15)]),
      column('b', [finding('src/x.ts', 5, 10)]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.line).toBe(1);
    expect(groups[0]!.takes[0]!.finding_ids).toHaveLength(2);
  });

  it('never groups the same lines across different files', () => {
    const groups = buildGroups([
      column('a', [finding('src/b.ts', 10, 20)]),
      column('b', [finding('src/a.ts', 10, 20)]),
    ]);
    expect(groups.map((g) => g.file)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('normalises a reversed range the way the grounding gate does', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 20, 10)]),
      column('b', [finding('src/x.ts', 12, 14)]),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('ignores findings of columns that are not done', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 2)], 'failed'),
      column('b', [finding('src/x.ts', 1, 2)], 'running'),
      column('c', [finding('src/x.ts', 1, 2)], 'cancelled'),
    ]);
    expect(groups).toEqual([]);
  });
});

describe('buildGroups — group fields and order', () => {
  it('uses the lowest start line for line and id, and sorts by file then line', () => {
    const groups = buildGroups([
      column('a', [finding('src/b.ts', 40, 41), finding('src/a.ts', 30, 31), finding('src/b.ts', 7, 9)]),
      column('b', [finding('src/b.ts', 5, 8)]),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['src/a.ts:30', 'src/b.ts:5', 'src/b.ts:40']);
    expect(groups.map((g) => g.line)).toEqual([30, 5, 40]);
  });

  it('titles the group after the most severe finding', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 9, 'SUGGESTION', 'minor nit')]),
      column('b', [finding('src/x.ts', 5, 6, 'CRITICAL', 'SQL injection')]),
      column('c', [finding('src/x.ts', 2, 3, 'WARNING', 'missing check')]),
    ]);
    expect(groups[0]!.title).toBe('SQL injection');
  });

  it('breaks a severity tie by the earlier start line', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 8, 9, 'WARNING', 'later')]),
      column('b', [finding('src/x.ts', 3, 9, 'WARNING', 'earlier')]),
    ]);
    expect(groups[0]!.title).toBe('earlier');
  });
});

describe('buildGroups — takes', () => {
  it('gives one take per column, in column order, including columns that did not flag', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 2)]),
      column('b', []),
      column('c', [], 'failed'),
      column('d', [], 'running'),
      column('e', [], 'cancelled'),
    ]);
    const takes = groups[0]!.takes;
    expect(takes.map((t) => t.agent_name)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(states(takes)).toEqual(['flagged', 'did_not_flag', 'failed', 'pending', 'cancelled']);
    for (const t of takes.slice(1)) {
      expect(t).toMatchObject({ severity: null, note: null, finding_ids: [] });
    }
  });

  it("summarises an agent's several findings by its strongest one and keeps all ids", () => {
    const low = finding('src/x.ts', 1, 4, 'SUGGESTION', 'style');
    const high = finding('src/x.ts', 3, 6, 'CRITICAL', 'auth bypass');
    const groups = buildGroups([column('a', [low, high])]);
    expect(groups[0]!.takes[0]).toMatchObject({
      state: 'flagged',
      severity: 'CRITICAL',
      note: 'auth bypass',
      finding_ids: [low.id, high.id],
    });
  });

  it('carries run and agent identity onto every take', () => {
    const groups = buildGroups([column('a', [finding('src/x.ts', 1, 2)])]);
    expect(groups[0]!.takes[0]).toMatchObject({
      run_id: 'run-a',
      agent_id: 'agent-a',
      agent_name: 'a',
    });
  });
});

describe('buildGroups — conflicts', () => {
  it('is a conflict when one finished agent flags and another finished agent does not', () => {
    const groups = buildGroups([column('a', [finding('src/x.ts', 1, 2)]), column('b', [])]);
    expect(groups[0]!.is_conflict).toBe(true);
  });

  it('is a conflict when finished agents flag the same lines with different severities', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 2, 'CRITICAL')]),
      column('b', [finding('src/x.ts', 1, 2, 'SUGGESTION')]),
    ]);
    expect(groups[0]!.is_conflict).toBe(true);
  });

  it('is not a conflict when all finished agents agree on severity', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 2, 'WARNING')]),
      column('b', [finding('src/x.ts', 1, 2, 'WARNING')]),
    ]);
    expect(groups[0]!.is_conflict).toBe(false);
  });

  it('does not count failed, running or cancelled agents as disagreeing', () => {
    const groups = buildGroups([
      column('a', [finding('src/x.ts', 1, 2)]),
      column('b', [], 'failed'),
      column('c', [], 'running'),
      column('d', [], 'cancelled'),
    ]);
    expect(groups[0]!.is_conflict).toBe(false);
  });
});

describe('isConflict', () => {
  const take = (state: FindingTake['state'], severity: Severity | null = null): FindingTake => ({
    run_id: 'r',
    agent_id: null,
    agent_name: null,
    state,
    severity,
    note: null,
    finding_ids: [],
  });

  it('needs at least two finished takes', () => {
    expect(isConflict([])).toBe(false);
    expect(isConflict([take('flagged', 'CRITICAL')])).toBe(false);
    expect(isConflict([take('flagged', 'CRITICAL'), take('pending'), take('failed')])).toBe(false);
  });

  it('flags a split between flagged and did_not_flag', () => {
    expect(isConflict([take('flagged', 'WARNING'), take('did_not_flag')])).toBe(true);
  });

  it('is false when every finished agent stayed silent', () => {
    expect(isConflict([take('did_not_flag'), take('did_not_flag')])).toBe(false);
  });

  it('compares severities only among flagged takes', () => {
    expect(isConflict([take('flagged', 'WARNING'), take('flagged', 'WARNING')])).toBe(false);
    expect(isConflict([take('flagged', 'WARNING'), take('flagged', 'CRITICAL')])).toBe(true);
  });
});
