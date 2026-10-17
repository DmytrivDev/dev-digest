import { describe, it, expect } from 'vitest';
import { AgentPerf, AgentStats, PerfWindowQuery } from '@devdigest/shared';

const row = {
  agent_id: 'a1',
  agent_name: 'Security Reviewer',
  enabled: true,
  runs: 6,
  failed_runs: 1,
  priced_runs: 6,
  total_cost_usd: 0.3,
  avg_cost_usd: 0.05,
  avg_duration_ms: 6200,
  findings: 9,
  accepted: 5,
  dismissed: 2,
  accept_rate: 5 / 7,
  small_sample: false,
  last_run_at: '2026-09-20T12:00:00.000Z',
  recent_runs: [
    { run_id: 'r1', ran_at: '2026-09-20T12:00:00.000Z', source: 'local', duration_ms: 6400, cost_usd: 0.06 },
    { run_id: 'r2', ran_at: '2026-09-17T12:00:00.000Z', source: 'ci', duration_ms: null, cost_usd: null },
  ],
};
const window = { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', days: null };

describe('agent performance contracts', () => {
  it('parses a full AgentPerf', () => {
    const perf = {
      window,
      cost_basis: 'estimate',
      min_decisions: 5,
      summary: {
        runs: 6, failed_runs: 1, priced_runs: 6, total_cost_usd: 0.3, accepted: 5, dismissed: 2,
        accept_rate: 5 / 7, small_sample: false,
        most_active: { agent_id: 'a1', agent_name: 'Security Reviewer', runs: 6 },
      },
      agents: [row],
      cost_by_agent: [{ agent_id: 'a1', agent_name: 'Security Reviewer', cost_usd: 0.3 }],
      cost_by_model: [{ model: null, cost_usd: 0.3, runs: 6 }],
    };
    expect(AgentPerf.safeParse(perf).success).toBe(true);
    expect(AgentPerf.safeParse({ ...perf, cost_basis: 'billing' }).success).toBe(false);
  });

  it('parses a full AgentStats', () => {
    const stats = { window: { ...window, days: 30 }, cost_basis: 'estimate', min_decisions: 5, agent: row };
    expect(AgentStats.safeParse(stats).success).toBe(true);
  });

  describe('PerfWindowQuery', () => {
    const ok = (q: unknown) => PerfWindowQuery.safeParse(q).success;
    it('accepts valid windows', () => {
      expect(ok({})).toBe(true);
      expect(ok({ days: '1' })).toBe(true);
      expect(ok({ days: '30' })).toBe(true);
      expect(ok({ from: '2026-10-01T00:00:00+03:00', to: '2026-10-08T00:00:00+03:00' })).toBe(true);
    });
    it('rejects the six invalid cases', () => {
      expect(ok({ days: '7' })).toBe(false);
      expect(ok({ days: '30', from: '2026-10-01T00:00:00Z', to: '2026-10-08T00:00:00Z' })).toBe(false);
      expect(ok({ from: '2026-10-01T00:00:00Z' })).toBe(false);
      expect(ok({ from: 'not-a-date', to: '2026-10-08T00:00:00Z' })).toBe(false);
      expect(ok({ from: '2026-10-08T00:00:00Z', to: '2026-10-08T00:00:00Z' })).toBe(false);
      expect(ok({ from: '2025-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.001Z' })).toBe(false);
    });
    it('accepts exactly 366 days', () => {
      expect(ok({ from: '2025-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' })).toBe(true);
    });
  });
});
