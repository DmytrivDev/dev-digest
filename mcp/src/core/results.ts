/**
 * Ring 1 — output Zod schemas for the tool results (D5). Written with mcp's
 * OWN `z` (D4's rule: a shared schema must never be passed to `registerTool`).
 * Types are `z.infer`red from these (zod `type-use-z-infer`).
 */
import type { Finding } from '@devdigest/shared';
import { z } from 'zod';

/**
 * One finding as `GET /runs/:id/result`'s `review.findings[]` carries it — the
 * shared `Finding` shape plus the triage field the review endpoint denormalizes
 * onto it (D2). Lives in ring 1 because the mappers consume it; `ports/` re-uses
 * it (ports may depend on core, never the reverse).
 */
export type RunResultReviewFinding = Finding & { dismissed_at: string | null };

// ---- shared vocabulary ------------------------------------------------------

export const SeverityOutput = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type SeverityOutput = z.infer<typeof SeverityOutput>;

export const RunStatusOutput = z.enum(['done', 'running', 'failed', 'cancelled']);
export type RunStatusOutput = z.infer<typeof RunStatusOutput>;

export const VerdictOutput = z.enum(['request_changes', 'approve', 'comment']);
export type VerdictOutput = z.infer<typeof VerdictOutput>;

// ---- list_agents ------------------------------------------------------------

export const AgentListItem = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  enabled: z.boolean(),
  model: z.string(),
});
export type AgentListItem = z.infer<typeof AgentListItem>;

export const AgentListOutput = z.object({
  agents: z.array(AgentListItem),
});
export type AgentListOutput = z.infer<typeof AgentListOutput>;

// ---- run_agent_on_pr / get_findings -----------------------------------------

export const FindingItem = z.object({
  severity: SeverityOutput,
  location: z.string(),
  title: z.string(),
  message: z.string(),
});
export type FindingItem = z.infer<typeof FindingItem>;

export const FindingsCounts = z.object({
  critical: z.number().int(),
  warning: z.number().int(),
  suggestion: z.number().int(),
});
export type FindingsCounts = z.infer<typeof FindingsCounts>;

export const FindingsResult = z.object({
  status: RunStatusOutput,
  run_id: z.string(),
  agent: z.string(),
  pr: z.string(),
  verdict: VerdictOutput.nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  counts: FindingsCounts,
  total: z.number().int(),
  truncated: z.boolean(),
  findings: z.array(FindingItem),
  trust: z.literal('untrusted'),
  hint: z.string().optional(),
  note: z.string().optional(),
  error: z.string().optional(),
  url: z.string(),
});
export type FindingsResult = z.infer<typeof FindingsResult>;

// ---- get_conventions ---------------------------------------------------------

export const ConventionItem = z.object({
  category: z.string(),
  rule: z.string(),
  evidence: z.string(),
});
export type ConventionItem = z.infer<typeof ConventionItem>;

export const ConventionCounts = z.object({
  accepted: z.number().int(),
  pending: z.number().int(),
  rejected: z.number().int(),
});
export type ConventionCounts = z.infer<typeof ConventionCounts>;

export const ConventionsResult = z.object({
  repo: z.string(),
  conventions: z.array(ConventionItem),
  counts: ConventionCounts,
  truncated: z.boolean(),
  hint: z.string().optional(),
  url: z.string(),
});
export type ConventionsResult = z.infer<typeof ConventionsResult>;
