import { describe, it, expect } from 'vitest';
import type { AgentPerfRow } from '@devdigest/shared';
import {
  buildAgentRow,
  buildAgentRows,
  costByAgent,
  costByModel,
  pickMostActive,
  summarize,
  validCostUsd,
  type PerfAgentInput,
  type PerfFindingCounts,
  type PerfRunInput,
} from '../src/modules/agent-performance/helpers/aggregate.js';
import { resolveWindow, windowDto } from '../src/modules/agent-performance/helpers/window.js';

const agent: PerfAgentInput = { id: 'a1', name: 'Alpha', enabled: true };
let seq = 0;
const T0 = Date.parse('2026-09-10T12:00:00Z');

function run(over: Partial<PerfRunInput> = {}): PerfRunInput {
  seq += 1;
  return {
    id: `r${String(seq).padStart(3, '0')}`,
    agentId: 'a1',
    ranAt: new Date(T0 + seq * 1000),
    status: 'done',
    source: 'local',
    durationMs: null,
    costUsd: null,
    model: null,
    ...over,
  };
}

const row = (runs: PerfRunInput[], counts: PerfFindingCounts[] = [], last: Date | null = null) =>
  buildAgentRow(agent, runs, new Map(counts.map((c) => [c.runId, c])), last);

function perfRow(over: Partial<AgentPerfRow>): AgentPerfRow {
  return {
    agent_id: 'x',
    agent_name: 'X',
    enabled: true,
    runs: 0,
    failed_runs: 0,
    priced_runs: 0,
    total_cost_usd: null,
    avg_cost_usd: null,
    avg_duration_ms: null,
    findings: 0,
    accepted: 0,
    dismissed: 0,
    accept_rate: null,
    small_sample: false,
    last_run_at: null,
    recent_runs: [],
    ...over,
  };
}

describe('validCostUsd (AC-3)', () => {
  it('rejects null, negative, non-finite and over-bound costs', () => {
    expect(validCostUsd(null)).toBeNull();
    expect(validCostUsd(-0.5)).toBeNull();
    expect(validCostUsd(5000)).toBeNull();
    expect(validCostUsd(Number.NaN)).toBeNull();
    expect(validCostUsd(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it('accepts 0 and the bound itself', () => {
    expect(validCostUsd(0)).toBe(0);
    expect(validCostUsd(1000)).toBe(1000);
  });
  it('unpriced runs appear with cost_usd null in recent_runs but still count as runs', () => {
    const r = row([run({ costUsd: -0.5 }), run({ costUsd: 5000 }), run({ costUsd: 0.04 })]);
    expect(r.runs).toBe(3);
    expect(r.priced_runs).toBe(1);
    expect(r.total_cost_usd).toBeCloseTo(0.04, 12);
    expect(r.recent_runs.filter((x) => x.cost_usd === null)).toHaveLength(2);
  });
});

describe('per-agent cost and duration (AC-4 .. AC-7)', () => {
  it('AC-4: [0.04, null, 0, -1] gives priced_runs 2, zero counts as priced', () => {
    const r = row([0.04, null, 0, -1].map((c) => run({ costUsd: c })));
    expect(r.priced_runs).toBe(2);
  });
  it('AC-5: totals, null when nothing is priced, 0 for [0]', () => {
    expect(row([0.04, 0.06, null].map((c) => run({ costUsd: c }))).total_cost_usd).toBeCloseTo(0.1, 12);
    expect(row([run(), run()]).total_cost_usd).toBeNull();
    expect(row([run({ costUsd: 0 })]).total_cost_usd).toBe(0);
  });
  it('AC-6: the unpriced run is not in the denominator', () => {
    const r = row([0.04, 0.06, null].map((c) => run({ costUsd: c })));
    expect(r.avg_cost_usd).toBeCloseTo(0.05, 12);
    expect(row([run()]).avg_cost_usd).toBeNull();
  });
  it('AC-7: mean over non-null durations; all-null gives null', () => {
    expect(row([6000, 7000, null].map((d) => run({ durationMs: d }))).avg_duration_ms).toBe(6500);
    expect(row([run(), run()]).avg_duration_ms).toBeNull();
  });
});

describe('accept rate and small sample (AC-9, AC-10)', () => {
  const withDecisions = (accepted: number, dismissed: number) => {
    const r = run();
    return row([r], [{ runId: r.id, findings: accepted + dismissed, accepted, dismissed }]);
  };
  it('AC-9: (3,2) gives 0.6, (0,0) gives null, (0,4) gives 0', () => {
    expect(withDecisions(3, 2).accept_rate).toBeCloseTo(0.6, 12);
    expect(withDecisions(0, 0).accept_rate).toBeNull();
    expect(withDecisions(0, 4).accept_rate).toBe(0);
  });
  it('AC-10: small_sample iff 1 <= decided < 5', () => {
    expect(withDecisions(0, 0).small_sample).toBe(false);
    expect(withDecisions(1, 0).small_sample).toBe(true);
    expect(withDecisions(2, 2).small_sample).toBe(true);
    expect(withDecisions(3, 2).small_sample).toBe(false);
  });
});

describe('counted runs, failed runs, findings (AC-1, AC-2, AC-8, AC-12)', () => {
  it('failed and cancelled runs add only to failed_runs', () => {
    const done = run({ costUsd: 0.05, durationMs: 1000 });
    const failed = run({ status: 'failed', costUsd: 9, durationMs: 99999 });
    const cancelled = run({ status: 'cancelled', costUsd: 9, durationMs: 99999 });
    const running = run({ status: 'running' });
    const nullStatus = run({ status: null });
    const counts: PerfFindingCounts[] = [
      { runId: done.id, findings: 3, accepted: 1, dismissed: 1 },
      { runId: failed.id, findings: 10, accepted: 5, dismissed: 5 },
    ];
    const r = row([done, failed, cancelled, running, nullStatus], counts);
    expect(r.runs).toBe(1);
    expect(r.failed_runs).toBe(2);
    expect(r.total_cost_usd).toBeCloseTo(0.05, 12);
    expect(r.avg_duration_ms).toBe(1000);
    expect(r.findings).toBe(3);
    expect(r.accepted).toBe(1);
    expect(r.dismissed).toBe(1);
    expect(r.recent_runs).toHaveLength(1);
  });
  it('AC-12: 7 counted runs give the 5 newest, newest first; 2 give 2', () => {
    const runs = Array.from({ length: 7 }, () => run());
    const r = row(runs);
    expect(r.recent_runs).toHaveLength(5);
    const expected = [...runs].reverse().slice(0, 5).map((x) => x.id);
    expect(r.recent_runs.map((x) => x.run_id)).toEqual(expected);
    expect(row([run(), run()]).recent_runs).toHaveLength(2);
  });
  it('last_run_at is passed through, null when never run', () => {
    expect(row([], [], new Date('2026-08-01T00:00:00Z')).last_run_at).toBe('2026-08-01T00:00:00.000Z');
    expect(row([]).last_run_at).toBeNull();
  });
});

describe('buildAgentRows (AC-18)', () => {
  it('returns one row per agent, including a disabled and a never-run one', () => {
    const agents: PerfAgentInput[] = [
      { id: 'a1', name: 'A', enabled: true },
      { id: 'a2', name: 'B', enabled: false },
      { id: 'a3', name: 'C', enabled: true },
    ];
    const rows = buildAgentRows(agents, [run({ agentId: 'a1' })], [], []);
    expect(rows.map((r) => r.agent_id)).toEqual(['a1', 'a2', 'a3']);
    expect(rows.map((r) => r.runs)).toEqual([1, 0, 0]);
    expect(rows[1]!.enabled).toBe(false);
  });
});

describe('summary (AC-19, AC-20, AC-23)', () => {
  it('AC-20: sums non-null totals; null when all null', () => {
    expect(
      summarize([0.1, null, 0.05].map((c) => perfRow({ total_cost_usd: c }))).total_cost_usd,
    ).toBeCloseTo(0.15, 12);
    expect(summarize([null, null].map((c) => perfRow({ total_cost_usd: c }))).total_cost_usd).toBeNull();
  });
  it('AC-19: runs, failed_runs, priced_runs are row sums', () => {
    const s = summarize([
      perfRow({ runs: 3, failed_runs: 1, priced_runs: 2 }),
      perfRow({ runs: 4, failed_runs: 0, priced_runs: 4 }),
    ]);
    expect([s.runs, s.failed_runs, s.priced_runs]).toEqual([7, 1, 6]);
  });
  it('AC-23: pooled rate, not the mean of rates', () => {
    const s = summarize([
      perfRow({ accepted: 9, dismissed: 1, accept_rate: 0.9 }),
      perfRow({ accepted: 0, dismissed: 1, accept_rate: 0 }),
    ]);
    expect(s.accept_rate).toBeCloseTo(9 / 11, 12);
    expect(s.accepted).toBe(9);
    expect(s.dismissed).toBe(2);
    expect(s.small_sample).toBe(false);
    expect(summarize([perfRow({ accepted: 1, dismissed: 1 })]).small_sample).toBe(true);
    expect(summarize([perfRow({})]).accept_rate).toBeNull();
  });
});

describe('pickMostActive (AC-24)', () => {
  const rec = (ran_at: string) => [
    { run_id: 'r', ran_at, source: 'local' as const, duration_ms: null, cost_usd: null },
  ];
  it('most runs wins', () => {
    const m = pickMostActive([
      perfRow({ agent_id: 'a', agent_name: 'A', runs: 2, recent_runs: rec('2026-09-01T00:00:00.000Z') }),
      perfRow({ agent_id: 'b', agent_name: 'B', runs: 5, recent_runs: rec('2026-08-01T00:00:00.000Z') }),
    ]);
    expect(m).toEqual({ agent_id: 'b', agent_name: 'B', runs: 5 });
  });
  it('tie goes to the newer newest run, then the lower name case-insensitively, then id', () => {
    const newer = pickMostActive([
      perfRow({ agent_id: 'a', agent_name: 'Alpha', runs: 3, recent_runs: rec('2026-09-01T00:00:00.000Z') }),
      perfRow({ agent_id: 'b', agent_name: 'Beta', runs: 3, recent_runs: rec('2026-09-02T00:00:00.000Z') }),
    ]);
    expect(newer?.agent_id).toBe('b');
    const byName = pickMostActive([
      perfRow({ agent_id: 'b', agent_name: 'beta', runs: 3, recent_runs: rec('2026-09-01T00:00:00.000Z') }),
      perfRow({ agent_id: 'a', agent_name: 'Zed', runs: 3, recent_runs: rec('2026-09-01T00:00:00.000Z') }),
      perfRow({ agent_id: 'c', agent_name: 'Alpha', runs: 3, recent_runs: rec('2026-09-01T00:00:00.000Z') }),
    ]);
    expect(byName?.agent_name).toBe('Alpha');
    const byId = pickMostActive([
      perfRow({ agent_id: 'z', agent_name: 'Same', runs: 3, recent_runs: rec('2026-09-01T00:00:00.000Z') }),
      perfRow({ agent_id: 'y', agent_name: 'same', runs: 3, recent_runs: rec('2026-09-01T00:00:00.000Z') }),
    ]);
    expect(byId?.agent_id).toBe('y');
  });
  it('is null when nothing ran', () => {
    expect(pickMostActive([perfRow({}), perfRow({})])).toBeNull();
  });
});

describe('cost breakdowns (AC-21, AC-22)', () => {
  it('AC-21: one segment per priced agent, summing to the total', () => {
    const rows = [
      perfRow({ agent_id: 'a', agent_name: 'A', runs: 2, priced_runs: 2, total_cost_usd: 0.3 }),
      perfRow({ agent_id: 'b', agent_name: 'B', runs: 1, priced_runs: 0, total_cost_usd: null }),
      perfRow({ agent_id: 'c', agent_name: 'C', runs: 1, priced_runs: 1, total_cost_usd: 0.1 }),
    ];
    const seg = costByAgent(rows);
    expect(seg).toHaveLength(2);
    expect(seg[0]!.agent_id).toBe('a');
    const sum = seg.reduce((s, x) => s + x.cost_usd, 0);
    expect(Math.abs(sum - (summarize(rows).total_cost_usd ?? 0))).toBeLessThan(1e-9);
  });
  it('AC-22: two models plus a null-model segment, summing to the total', () => {
    const runs = [
      run({ model: 'm1', costUsd: 0.04 }),
      run({ model: 'm1', costUsd: 0.06 }),
      run({ model: 'm2', costUsd: 0.02 }),
      run({ model: null, costUsd: 0.01, source: 'ci' }),
      run({ model: null, costUsd: 0.01, source: 'ci' }),
      run({ model: 'm1', costUsd: null }),
      run({ model: 'm1', costUsd: 5000 }),
      run({ model: 'm3', costUsd: 7, status: 'failed' }),
    ];
    const seg = costByModel(runs);
    expect(seg.map((s) => s.model)).toEqual(['m1', 'm2', null]);
    expect(seg.find((s) => s.model === 'm1')!.runs).toBe(2);
    expect(seg.find((s) => s.model === null)!.runs).toBe(2);
    const total = summarize(buildAgentRows([agent], runs, [], [])).total_cost_usd ?? 0;
    expect(Math.abs(seg.reduce((s, x) => s + x.cost_usd, 0) - total)).toBeLessThan(1e-9);
  });
  it('a cost tie puts the null model last', () => {
    const seg = costByModel([run({ model: null, costUsd: 0.1 }), run({ model: 'z', costUsd: 0.1 })]);
    expect(seg.map((s) => s.model)).toEqual(['z', null]);
  });
});

describe('resolveWindow (AC-15, AC-17)', () => {
  const now = new Date('2026-10-17T10:00:00.000Z');
  const DAY = 86_400_000;
  it('days=1 and days=30 are rolling windows ending now', () => {
    const one = resolveWindow({ days: 1 }, now);
    expect(one.to).toEqual(now);
    expect(now.getTime() - one.from.getTime()).toBe(DAY);
    expect(one.days).toBe(1);
    const thirty = resolveWindow({ days: 30 }, now);
    expect(now.getTime() - thirty.from.getTime()).toBe(30 * DAY);
    expect(thirty.days).toBe(30);
  });
  it('an empty query behaves as days=30', () => {
    const w = resolveWindow({}, now);
    expect(w.days).toBe(30);
    expect(now.getTime() - w.from.getTime()).toBe(30 * DAY);
  });
  it('an explicit pair is kept as given and echoes days null in UTC', () => {
    const w = resolveWindow({ from: '2026-10-01T00:00:00+03:00', to: '2026-10-08T00:00:00+03:00' }, now);
    expect(w.days).toBeNull();
    expect(windowDto(w)).toEqual({
      from: '2026-09-30T21:00:00.000Z',
      to: '2026-10-07T21:00:00.000Z',
      days: null,
    });
  });
});
