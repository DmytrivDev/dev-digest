import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A6 — Productionize contracts (L08).
 *
 * NEW file (A6 owns it; the barrel re-exports it). Covers:
 *   - PluginBundle / InstalledPlugin   POST /plugins/export, /plugins/import, GET /plugins
 *   - AgentPerf / AgentPerfRow         GET /agents/performance
 *   - Digest / DigestSettings          Weekly Digest (settings + cron-built rows)
 *
 * Nothing here mutates an existing contract — these sit alongside A2's
 * `review-api.ts` and A5's `observability.ts`.
 */

// ---------------------------------------------------------------------------
// Plugin export / import  (.devdigest-plugin/ bundle)
// ---------------------------------------------------------------------------

/** An exported skill (config only — no DB ids; round-trippable). */
export const PluginSkill = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['rubric', 'convention', 'security', 'custom']),
  source: z.enum(['manual', 'imported_url', 'extracted', 'community']),
  body: z.string(),
  enabled: z.boolean(),
  evidence_files: z.array(z.string()).nullish(),
});
export type PluginSkill = z.infer<typeof PluginSkill>;

/** An exported agent. `skills` references PluginSkill.name within the bundle. */
export const PluginAgent = z.object({
  name: z.string(),
  description: z.string(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  /** Names of skills (in this bundle) linked to the agent, in order. */
  skills: z.array(z.string()),
});
export type PluginAgent = z.infer<typeof PluginAgent>;

/** An exported eval case. `owner_ref` ties it to an agent or skill by name. */
export const PluginEvalCase = z.object({
  name: z.string(),
  owner_kind: z.enum(['skill', 'agent']),
  owner_ref: z.string(),
  input_diff: z.string().nullish(),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown().nullish(),
  notes: z.string().nullish(),
});
export type PluginEvalCase = z.infer<typeof PluginEvalCase>;

/** An exported convention (house-rule). */
export const PluginConvention = z.object({
  rule: z.string(),
  evidence_path: z.string().nullish(),
  evidence_snippet: z.string().nullish(),
  confidence: z.number().nullish(),
  accepted: z.boolean(),
});
export type PluginConvention = z.infer<typeof PluginConvention>;

export const PluginManifest = z.object({
  name: z.string(),
  version: z.string(),
  format: z.literal('devdigest-plugin/v1'),
  exported_at: z.string(),
  description: z.string().nullish(),
  counts: z.object({
    agents: z.number().int(),
    skills: z.number().int(),
    eval_cases: z.number().int(),
    conventions: z.number().int(),
  }),
});
export type PluginManifest = z.infer<typeof PluginManifest>;

/** The whole `.devdigest-plugin/` bundle as one JSON document. */
export const PluginBundle = z.object({
  manifest: PluginManifest,
  agents: z.array(PluginAgent),
  skills: z.array(PluginSkill),
  eval_cases: z.array(PluginEvalCase),
  conventions: z.array(PluginConvention),
});
export type PluginBundle = z.infer<typeof PluginBundle>;

/** Request body for POST /plugins/export. */
export const PluginExportRequest = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  /** Limit export to a subset of agent ids (default: all). */
  agent_ids: z.array(z.string()).optional(),
});
export type PluginExportRequest = z.infer<typeof PluginExportRequest>;

/** Request body for POST /plugins/import. */
export const PluginImportRequest = z.object({
  bundle: PluginBundle,
  /** 'merge' keeps existing items; 'replace' is reserved (merge is the default). */
  mode: z.enum(['merge', 'replace']).default('merge').optional(),
});
export type PluginImportRequest = z.infer<typeof PluginImportRequest>;

/** A row in `installed_plugins` (GET /plugins). */
export const InstalledPlugin = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().nullable(),
  source: z.string().nullable(),
  installed_at: z.string(),
  enabled: z.boolean(),
});
export type InstalledPlugin = z.infer<typeof InstalledPlugin>;

/** Result of an import: what was created + the installed_plugins row. */
export const PluginImportResult = z.object({
  installed: InstalledPlugin,
  created: z.object({
    agents: z.number().int(),
    skills: z.number().int(),
    eval_cases: z.number().int(),
    conventions: z.number().int(),
  }),
});
export type PluginImportResult = z.infer<typeof PluginImportResult>;

// ---------------------------------------------------------------------------
// Agent Performance  (GET /agents/performance, GET /agents/:id/stats — SPEC-10)
// ---------------------------------------------------------------------------

/** Rolling presets the window selector offers. */
export const PERF_WINDOW_DAYS = [1, 30] as const;
/** Longest custom window, in days (24 h each), measured as `to − from`. */
export const PERF_MAX_SPAN_DAYS = 366;

/** Query of GET /agents/performance and GET /agents/:id/stats (AC-15, AC-16). */
export const PerfWindowQuery = z
  .object({
    days: z.coerce.number().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((q, ctx) => {
    const hasRange = q.from !== undefined || q.to !== undefined;
    if (q.days !== undefined && !(PERF_WINDOW_DAYS as readonly number[]).includes(q.days)) {
      ctx.addIssue({ code: 'custom', path: ['days'], message: 'days must be 1 or 30' });
    }
    if (q.days !== undefined && hasRange) {
      ctx.addIssue({ code: 'custom', path: ['days'], message: 'days cannot be combined with from/to' });
    }
    if ((q.from === undefined) !== (q.to === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [q.from === undefined ? 'from' : 'to'],
        message: 'from and to must be given together',
      });
    }
    if (q.from !== undefined && q.to !== undefined) {
      const span = Date.parse(q.to) - Date.parse(q.from);
      if (span <= 0) {
        ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must be before to' });
      } else if (span > PERF_MAX_SPAN_DAYS * 86_400_000) {
        ctx.addIssue({
          code: 'custom',
          path: ['to'],
          message: `range must not exceed ${PERF_MAX_SPAN_DAYS} days`,
        });
      }
    }
  });
export type PerfWindowQuery = z.infer<typeof PerfWindowQuery>;

export const PerfWindowDays = z.union([z.literal(1), z.literal(30)]);
export type PerfWindowDays = z.infer<typeof PerfWindowDays>;

export const PerfWindow = z.object({
  from: z.string(),
  to: z.string(),
  days: PerfWindowDays.nullable(),
});
export type PerfWindow = z.infer<typeof PerfWindow>;

export const CostBasis = z.literal('estimate');
export type CostBasis = z.infer<typeof CostBasis>;

export const PerfRecentRun = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  source: z.enum(['local', 'ci']),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type PerfRecentRun = z.infer<typeof PerfRecentRun>;

/** The ONE per-agent row both endpoints return (spec "Per-agent row"). */
export const AgentPerfRow = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  enabled: z.boolean(),
  runs: z.number().int(),
  failed_runs: z.number().int(),
  priced_runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  findings: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  accept_rate: z.number().min(0).max(1).nullable(),
  small_sample: z.boolean(),
  last_run_at: z.string().nullable(),
  recent_runs: z.array(PerfRecentRun).max(5),
});
export type AgentPerfRow = z.infer<typeof AgentPerfRow>;

export const PerfMostActive = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
});
export type PerfMostActive = z.infer<typeof PerfMostActive>;

export const PerfSummary = z.object({
  runs: z.number().int(),
  failed_runs: z.number().int(),
  priced_runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  accept_rate: z.number().min(0).max(1).nullable(),
  small_sample: z.boolean(),
  most_active: PerfMostActive.nullable(),
});
export type PerfSummary = z.infer<typeof PerfSummary>;

export const PerfAgentCost = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  cost_usd: z.number(),
});
export type PerfAgentCost = z.infer<typeof PerfAgentCost>;

export const PerfModelCost = z.object({
  model: z.string().nullable(),
  cost_usd: z.number(),
  runs: z.number().int(),
});
export type PerfModelCost = z.infer<typeof PerfModelCost>;

/** Response of GET /agents/performance. */
export const AgentPerf = z.object({
  window: PerfWindow,
  cost_basis: CostBasis,
  min_decisions: z.number().int(),
  summary: PerfSummary,
  agents: z.array(AgentPerfRow),
  cost_by_agent: z.array(PerfAgentCost),
  cost_by_model: z.array(PerfModelCost),
});
export type AgentPerf = z.infer<typeof AgentPerf>;

// re-export Severity-adjacent helper to keep the import surface tidy
export { Severity };

// ---------------------------------------------------------------------------
// Weekly Digest
// ---------------------------------------------------------------------------

/** A persisted digest row (one period summary). */
export const Digest = z.object({
  id: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  body_md: z.string().nullable(),
  delivered_to: z.string().nullable(),
});
export type Digest = z.infer<typeof Digest>;

/** Request body for POST /digest/run (build now). */
export const DigestRunRequest = z.object({
  /** ISO range; defaults to the last 7 days. */
  period_start: z.string().optional(),
  period_end: z.string().optional(),
});
export type DigestRunRequest = z.infer<typeof DigestRunRequest>;
