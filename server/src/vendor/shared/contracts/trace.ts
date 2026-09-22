import { z } from 'zod';
import { SkillSource, SkillType } from './knowledge.js';

/**
 * Run trace. The ENTIRE trace of one run is persisted as a SINGLE
 * jsonb document in `run_traces` (not per-row). Live events stream via SSE
 * during the run; the full log is written once on completion.
 */

export const RunEventKind = z.enum(['info', 'tool', 'result', 'error']);
export type RunEventKind = z.infer<typeof RunEventKind>;

/** A single live-log line. `t` = elapsed timestamp string (e.g. "00.31"). */
export const RunLogLine = z.object({
  t: z.string(),
  kind: RunEventKind,
  msg: z.string(),
});
export type RunLogLine = z.infer<typeof RunLogLine>;

/** SSE payload streamed on `/runs/:id/events`. */
export const RunEvent = z.object({
  runId: z.string(),
  seq: z.number().int(),
  kind: RunEventKind,
  msg: z.string(),
  t: z.string(),
  data: z.unknown().optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;

export const ToolCall = z.object({
  tool: z.string(),
  args: z.string(),
  meta: z.string().nullish(),
  ms: z.number().int(),
});
export type ToolCall = z.infer<typeof ToolCall>;

export const PromptAssembly = z.object({
  system: z.string(),
  skills: z.string().nullish(),
  memory: z.string().nullish(),
  specs: z.string().nullish(),
  /** Callers-of-changed-symbols digest (repo-intel); null when absent. */
  callers: z.string().nullish(),
  /** Repo skeleton / map (repo-intel); null when absent. Enables per-slot token
      attribution in the run trace. */
  repo_map: z.string().nullish(),
  /** PR author's description/body (truncated); null when absent. */
  pr_description: z.string().nullish(),
  /** Server-derived PR intent + scope (untrusted — derived from
      author-controlled text), delimiter-wrapped; null when omitted. */
  intent: z.string().nullish(),
  user: z.string(),
  /**
   * Tokens contributed by each prompt slot, keyed by the field names above
   * ('system', 'skills', 'user', …). Counted server-side AFTER assembly — the
   * pure engine has no tokenizer — so it is absent on traces written before
   * this existed and on the degraded failure/cancel trace. Read it as "unknown",
   * never as zero.
   */
  token_counts: z.record(z.string(), z.number().int()).nullish(),
});
export type PromptAssembly = z.infer<typeof PromptAssembly>;

export const MemoryPulled = z.object({
  pr: z.number().int().nullish(),
  text: z.string(),
});
export type MemoryPulled = z.infer<typeof MemoryPulled>;

/**
 * One skill the run carried, captured at prompt-assembly time.
 *
 * A SNAPSHOT, not a live join: an agent's linked skills can be re-ordered,
 * detached or edited after the run, so resolving `agent_skills` at read time
 * would silently re-label history. `version` is the skill's version at the
 * moment it was assembled, which is what makes an old trace reproducible.
 */
export const SkillUsed = z.object({
  id: z.string(),
  name: z.string(),
  type: SkillType,
  source: SkillSource,
  /** The skill's `version` when this run assembled it, not its current one. */
  version: z.number().int(),
  /** 0-based position in the agent's link list — the prompt-block order. */
  order: z.number().int(),
  /** False = linked to the agent but skipped, so it contributed NO block. */
  enabled: z.boolean(),
  /** True = the body was delimiter-wrapped before the model saw it. */
  untrusted: z.boolean(),
  /** Tokens this skill's block contributed; null for a skipped skill. */
  tokens: z.number().int().nullish(),
});
export type SkillUsed = z.infer<typeof SkillUsed>;

export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /** Generation cost in USD; null when un-priced (UI shows "—", not "$0"). */
  cost_usd: z.number().nullable(),
  findings: z.number().int(),
  grounding: z.string(),
});
export type RunStats = z.infer<typeof RunStats>;

/** The single-document trace stored in `run_traces.trace`. */
export const RunTrace = z.object({
  config: z.object({
    agent: z.string(),
    version: z.string().nullish(),
    provider: z.string().nullish(),
    model: z.string(),
    pr: z.number().int().nullish(),
    source: z.enum(['local', 'ci']).default('local'),
  }),
  stats: RunStats,
  prompt_assembly: PromptAssembly,
  tool_calls: z.array(ToolCall),
  raw_output: z.string(),
  memory_pulled: z.array(MemoryPulled),
  specs_read: z.array(z.string()),
  /**
   * The agent's linked skills as this run resolved them, in link order.
   *
   * NULLISH rather than `.default([])` on purpose: `getRunTrace` CASTS the
   * jsonb document (`row.trace as RunTrace`) instead of parsing it, so a
   * default would be a lie — a trace written before this field existed really
   * does arrive without the key, and a consumer that maps over it blindly
   * crashes. Read it as `?? []`. An EMPTY array is a different fact: the run
   * resolved the links and the agent had none.
   */
  skills_used: z.array(SkillUsed).nullish(),
  log: z.array(RunLogLine),
});
export type RunTrace = z.infer<typeof RunTrace>;

/**
 * One row of a PR's run history (every agent_runs row, any status). Surfaced on
 * the PR page so runs — including FAILED ones with their error — survive reload.
 */
export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string().nullable(), // running | done | failed | cancelled
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** Generation cost in USD; null when un-priced (UI shows "—", not "$0"). */
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  // Review outcome, denormalized onto the run row at completion (the timeline
  // has no FK to the review). score = the review's 0-100 score; blockers =
  // findings that trip the agent's gate. Null on failed/cancelled runs.
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;
