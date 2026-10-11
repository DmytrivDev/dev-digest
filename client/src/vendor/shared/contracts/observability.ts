import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord, ReviewRunTarget } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** Request of POST /pulls/:id/multi-agent-run. Duplicates are collapsed server-side; capped at 50 ids (same cap as the estimates read). */
export const MultiAgentRunRequest = z.object({
  agent_ids: z.array(z.string().uuid()).min(1).max(50),
});
export type MultiAgentRunRequest = z.infer<typeof MultiAgentRunRequest>;

/** Response of POST /pulls/:id/multi-agent-run: the parent id and one run per agent. */
export const MultiAgentRunStarted = z.object({
  id: z.string(),
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
});
export type MultiAgentRunStarted = z.infer<typeof MultiAgentRunStarted>;

export const AgentRunStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: AgentRunStatus,
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  grounding: z.string().nullable(),
  findings: z.array(FindingRecord),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a finding group. */
export const TakeState = z.enum(['flagged', 'did_not_flag', 'failed', 'cancelled', 'pending']);
export type TakeState = z.infer<typeof TakeState>;

export const FindingTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  state: TakeState,
  severity: Severity.nullable(),
  note: z.string().nullable(),
  finding_ids: z.array(z.string()),
});
export type FindingTake = z.infer<typeof FindingTake>;

/**
 * Findings from different agents that overlap on the same file lines, with one
 * take per agent. Computed on read from persisted findings; never stored.
 */
export const FindingGroup = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  is_conflict: z.boolean(),
  takes: z.array(FindingTake),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/** Response of GET /multi-agent-runs/:id. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullish(),
  repo_id: z.string().nullish(),
  ran_at: z.string(),
  status: z.enum(['running', 'done']),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  groups: z.array(FindingGroup),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Average of an agent's newest done runs (GET /agents/run-estimates). */
export const AgentRunEstimate = z.object({
  agent_id: z.string(),
  runs_sampled: z.number().int(),
  avg_duration_ms: z.number().int().nullable(),
  avg_cost_usd: z.number().nullable(),
});
export type AgentRunEstimate = z.infer<typeof AgentRunEstimate>;

export const AgentRunEstimates = z.object({
  estimates: z.array(AgentRunEstimate),
});
export type AgentRunEstimates = z.infer<typeof AgentRunEstimates>;

/** One row of GET /pulls/:id/multi-agent-runs (a PR's recent multi-agent runs). */
export const MultiAgentRunSummary = z.object({
  id: z.string(),
  ran_at: z.string(),
  status: z.enum(['running', 'done']),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
});
export type MultiAgentRunSummary = z.infer<typeof MultiAgentRunSummary>;

export const MultiAgentRunList = z.object({
  runs: z.array(MultiAgentRunSummary),
});
export type MultiAgentRunList = z.infer<typeof MultiAgentRunList>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
