/* Test fixtures for the Agent Performance dashboard components. Defaults are
   non-empty on purpose: a row with several "—" cells makes `getByText("—")`
   ambiguous (client/INSIGHTS.md, em-dash entry). */
import type { AgentPerf, AgentPerfRow } from "@devdigest/shared";

export function perfRow(over: Partial<AgentPerfRow> = {}): AgentPerfRow {
  return {
    agent_id: "a1",
    agent_name: "Security Reviewer",
    enabled: true,
    runs: 42,
    failed_runs: 0,
    priced_runs: 42,
    total_cost_usd: 8.4,
    avg_cost_usd: 0.2,
    avg_duration_ms: 6234,
    findings: 30,
    accepted: 18,
    dismissed: 5,
    accept_rate: 18 / 23,
    small_sample: false,
    last_run_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    recent_runs: [],
    ...over,
  };
}

export function perfResponse(over: Partial<AgentPerf> = {}): AgentPerf {
  return {
    window: { from: "2026-09-17T00:00:00.000Z", to: "2026-10-17T00:00:00.000Z", days: 30 },
    cost_basis: "estimate",
    min_decisions: 5,
    summary: {
      runs: 42,
      failed_runs: 3,
      priced_runs: 40,
      total_cost_usd: 8.74,
      accepted: 55,
      dismissed: 35,
      accept_rate: 55 / 90,
      small_sample: false,
      most_active: { agent_id: "a1", agent_name: "Security Reviewer", runs: 142 },
    },
    agents: [perfRow()],
    cost_by_agent: [{ agent_id: "a1", agent_name: "Security Reviewer", cost_usd: 8.74 }],
    cost_by_model: [{ model: "gpt-4.1", cost_usd: 8.74, runs: 40 }],
    ...over,
  };
}
