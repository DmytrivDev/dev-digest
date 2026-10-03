import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** Confidence tier for a derived Intent — computed by us from which sources
 * resolved, never asked of the model (verbalised LLM confidence is
 * empirically miscalibrated). See docs/plans/intent-layer.plan.md §2.7. */
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/** What kind of signal a derived Intent's provenance entry came from. */
export const IntentSourceKind = z.enum([
  'linked_issue',
  'mentioned_issue',
  'ticket_key',
  'spec_doc',
  'pr_body',
  'pr_title',
  'branch',
  'commits',
  'paths',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** One provenance entry — a source the classifier was given, and whether it
 * actually resolved (fetched/read successfully). */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string().nullish(),
  resolved: z.boolean(),
  detail: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** A persisted/derived Intent, widened with confidence, provenance, the
 * model that produced it, and when. */
export const DerivedIntent = Intent.extend({
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
  model: z.string().nullish(),
  derived_at: z.string(),
  cost_usd: z.number().nullish(),
});
export type DerivedIntent = z.infer<typeof DerivedIntent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

/** Why the facade could not fully use the index — "no results" is not a reason. */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
  'files_unavailable',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

/** Named `Blast…` so it does not collide with the `IndexStatus` export in platform.ts. */
export const BlastIndexStatus = z.enum(['full', 'partial', 'degraded', 'failed']);
export type BlastIndexStatus = z.infer<typeof BlastIndexStatus>;

export const BlastCounts = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});
export type BlastCounts = z.infer<typeof BlastCounts>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
  // Optional: this caller's own endpoints/crons, so the graph can draw honest
  // caller→endpoint/cron edges instead of assigning them to the whole group.
  endpoints: z.array(z.string()).optional(),
  crons: z.array(z.string()).optional(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  // Optional fields below are absent when the server predates them.
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
  index_status: BlastIndexStatus.optional(),
  /** Commit the caller `file:line` links resolve against (repo_index_state.last_indexed_sha). */
  indexed_sha: z.string().optional(),
  counts: BlastCounts.optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

/** Why history is unavailable — absent when history was fetched normally. */
export const PrHistoryUnavailableReason = z.enum(['no_github', 'github_error']);
export type PrHistoryUnavailableReason = z.infer<typeof PrHistoryUnavailableReason>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
  reason: PrHistoryUnavailableReason.optional(),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
// Declaration order IS the Smart Diff display order.
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
// Declaration order matters: every schema referenced here is declared above.

/** Which input the brief was built from — exactly one entry per source, always. */
export const BriefInputSource = z.enum([
  'intent',
  'blast',
  'diff_stats',
  'description',
  'linked_issue',
  'specs',
]);
export type BriefInputSource = z.infer<typeof BriefInputSource>;

export const BriefInputStatus = z.enum(['used', 'truncated', 'missing']);
export type BriefInputStatus = z.infer<typeof BriefInputStatus>;

export const BriefInput = z
  .object({
    source: BriefInputSource,
    status: BriefInputStatus,
    reason: z.string().optional(),
    /** diff_stats only: how many file rows the token budget cut. */
    omitted: z.number().int().nonnegative().optional(),
  })
  .refine((i) => i.status === 'used' || (i.reason !== undefined && i.reason.length > 0), {
    message: 'reason is required when status is not used',
    path: ['reason'],
  });
export type BriefInput = z.infer<typeof BriefInput>;

export const ReviewFocusItem = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  reason: z.string().max(200),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const BriefUsage = z.object({
  llm_calls: z.number().int().nonnegative(),
  /** The prompt as the budget measured it: cl100k tokens of system + user (AC-61). The
   *  provider's own `tokens_in` differs (its tokenizer, chat template). Absent on briefs
   *  stored before 2026-10-03. */
  prompt_tokens: z.number().int().nonnegative().optional(),
  tokens_in: z.number().int().nonnegative().nullable(),
  tokens_out: z.number().int().nonnegative().nullable(),
  cost_usd: z.number().nonnegative().nullable(),
  duration_ms: z.number().int().nonnegative(),
});
export type BriefUsage = z.infer<typeof BriefUsage>;

/** Items the server removed after the model answered (unknown file / line outside the diff). */
export const BriefDropped = z.object({
  risks: z.number().int().nonnegative(),
  review_focus: z.number().int().nonnegative(),
});
export type BriefDropped = z.infer<typeof BriefDropped>;

export const PrBrief = z.object({
  summary: z.string().max(400),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  history: PrHistory.optional(),
  head_sha: z.string(),
  generated_at: z.string(),
  model: z.string(),
  usage: BriefUsage,
  inputs: z.array(BriefInput),
  dropped: BriefDropped,
});
export type PrBrief = z.infer<typeof PrBrief>;

export const PrBriefResponse = z.object({
  brief: PrBrief.nullable(),
  generating: z.boolean(),
  stale: z.boolean(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
