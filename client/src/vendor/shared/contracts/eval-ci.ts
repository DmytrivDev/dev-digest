import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { Conformance, Provider, ReviewStrategy, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `Conformance` lives in `knowledge.ts`; here we add the *API-facing*
 * request/response shapes (records persisted in `eval_cases`,
 * `eval_suite_runs`, `eval_case_outcomes`, `composed_reviews`,
 * `ci_installations`, `ci_runs`, `conformance_checks`) plus the eval-dashboard
 * aggregate.
 */

// ===========================================================================
// Eval — regression harness for review agents (SPEC-04)
//
// One eval CASE is a frozen single-file diff plus one expectation (a line range
// the agent must flag, or must not). One SUITE RUN replays every case of an
// agent against its current prompt/model and scores the grounded findings with
// no further model call. Wire fields are snake_case.
// ===========================================================================

/** What the case expects of the agent: flag this range, or stay away from it. */
export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationKind = z.infer<typeof EvalExpectationKind>;

export const EvalExpectation = z
  .object({
    kind: EvalExpectationKind,
    file: z.string().min(1),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
  })
  .refine((e) => e.end_line >= e.start_line, {
    message: 'end_line must be >= start_line',
    path: ['end_line'],
  });
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** PR facts frozen onto the case when it was created. */
export const EvalCaseInputMeta = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
});
export type EvalCaseInputMeta = z.infer<typeof EvalCaseInputMeta>;

/** Display labels copied from the source finding (never sent to a model). */
export const EvalCaseLabels = z.object({
  severity: z.string(),
  category: z.string(),
  title: z.string(),
});
export type EvalCaseLabels = z.infer<typeof EvalCaseLabels>;

/** Where the case came from. `available` is false once the source finding is gone. */
export const EvalCaseSource = z.object({
  finding_id: z.string().nullable(),
  pr_number: z.number().int(),
  repo: z.string(),
  available: z.boolean(),
});
export type EvalCaseSource = z.infer<typeof EvalCaseSource>;

/** One grounded finding the agent produced for a case. */
export const EvalActualFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: z.string(),
  category: z.string(),
  title: z.string(),
});
export type EvalActualFinding = z.infer<typeof EvalActualFinding>;

/**
 * The stored result of one case inside one suite run. It carries a snapshot of
 * the expectation (`kind` + `expectation`) so a run stays comparable after the
 * case is edited or deleted.
 */
export const EvalCaseOutcome = z.object({
  case_id: z.string(),
  case_name: z.string(),
  kind: EvalExpectationKind,
  expectation: EvalExpectation,
  status: z.enum(['scored', 'errored']),
  /** null when errored. */
  pass: z.boolean().nullable(),
  /** e.g. "timeout", "llm_error", "invalid_output"; null when scored. */
  error_reason: z.string().nullable(),
  findings_matched: z.number().int(),
  findings_total: z.number().int(),
  grounding_kept: z.number().int(),
  grounding_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  actual: z.array(EvalActualFinding),
});
export type EvalCaseOutcome = z.infer<typeof EvalCaseOutcome>;

export const EvalCase = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string().min(1),
  notes: z.string().nullable(),
  input_diff: z.string(),
  input_meta: EvalCaseInputMeta,
  expectation: EvalExpectation,
  labels: EvalCaseLabels,
  source: EvalCaseSource,
  created_at: z.string(),
  /** From the latest run that contained the case. */
  last_outcome: EvalCaseOutcome.nullable(),
});
export type EvalCase = z.infer<typeof EvalCase>;

/** Body of `PATCH /eval/cases/:id`. Strict: an unknown key is a 422, not ignored. */
export const EvalCaseUpdate = z
  .object({
    name: z.string().trim().min(1).optional(),
    notes: z.string().nullable().optional(),
    expectation: EvalExpectation.optional(),
  })
  .strict();
export type EvalCaseUpdate = z.infer<typeof EvalCaseUpdate>;

export const EvalRunStatus = z.enum(['running', 'completed', 'failed']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

export const EvalRunErrorReason = z.enum(['all_cases_errored', 'interrupted']);
export type EvalRunErrorReason = z.infer<typeof EvalRunErrorReason>;

/** The agent configuration a run was started with (recorded at start). */
export const EvalRunConfig = z.object({
  system_prompt: z.string(),
  model: z.string(),
  provider: Provider,
  strategy: ReviewStrategy,
  skills: z.array(z.object({ name: z.string(), version: z.number().int() })),
});
export type EvalRunConfig = z.infer<typeof EvalRunConfig>;

export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int(),
  status: EvalRunStatus,
  error_reason: EvalRunErrorReason.nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_passed: z.number().int(),
  cases_scored: z.number().int(),
  cases_errored: z.number().int(),
  recall: z.number().min(0).max(1).nullable(),
  precision: z.number().min(0).max(1).nullable(),
  citation_accuracy: z.number().min(0).max(1).nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  config: EvalRunConfig,
  /** Only on `GET /eval/runs/:id`. */
  outcomes: z.array(EvalCaseOutcome).optional(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

/** Response of `POST /agents/:id/eval/runs` (202). */
export const EvalRunStartResponse = z.object({
  run_id: z.string(),
  status: z.literal('running'),
  cases_total: z.number().int(),
});
export type EvalRunStartResponse = z.infer<typeof EvalRunStartResponse>;

export const EvalMetricSet = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalMetricSet = z.infer<typeof EvalMetricSet>;

/** Response of `GET /eval/compare?a=&b=` — `old` is always the earlier run. */
export const EvalCompare = z.object({
  old: EvalSuiteRun,
  new: EvalSuiteRun,
  common_case_ids: z.array(z.string()),
  only_in_old: z.array(z.object({ case_id: z.string(), name: z.string() })),
  only_in_new: z.array(z.object({ case_id: z.string(), name: z.string() })),
  /** Recomputed over the common cases only. */
  metrics: z.object({ old: EvalMetricSet, new: EvalMetricSet }),
  deltas: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
    cost_usd: z.number().nullable(),
  }),
  config_changes: z.array(
    z.object({
      field: z.enum(['model', 'provider', 'strategy', 'skills']),
      old: z.string(),
      new: z.string(),
    }),
  ),
  prompt_diff: z.array(
    z.object({ kind: z.enum(['context', 'added', 'removed']), text: z.string() }),
  ),
  flips: z.array(
    z.object({
      case_id: z.string(),
      name: z.string(),
      direction: z.enum(['now_passing', 'now_failing']),
    }),
  ),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/** A metric that fell by the regression threshold between the last two completed runs. */
export const EvalAlert = z.object({
  drops: z.array(
    z.object({
      metric: z.enum(['recall', 'precision', 'citation_accuracy']),
      old_value: z.number(),
      new_value: z.number(),
      old_version: z.number().int(),
      new_version: z.number().int(),
    }),
  ),
  now_failing: z.array(z.object({ case_id: z.string(), name: z.string() })),
});
export type EvalAlert = z.infer<typeof EvalAlert>;

/** One point on the dashboard trend (per completed run, chronological). */
export const EvalTrendPoint = z.object({
  started_at: z.string(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** One row of `GET /eval/overview` — every workspace agent, including zero-case ones. */
export const EvalOverviewRow = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest_run: EvalSuiteRun.nullable(),
});
export type EvalOverviewRow = z.infer<typeof EvalOverviewRow>;

/** Response of `GET /agents/:id/eval/dashboard`. */
export const EvalDashboard = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    model: z.string(),
  }),
  cases_total: z.number().int(),
  runs: z.array(EvalSuiteRun),
  trend: z.array(EvalTrendPoint),
  alert: EvalAlert.nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ---- Reason codes the eval endpoints answer with (AppError `code`) ----------

export const EvalCreateCaseErrorCode = z.enum([
  'finding_not_triaged',
  'not_agent_finding',
  'agent_missing',
  'patch_missing',
  'range_outside_hunks',
  'diff_too_large',
]);
export type EvalCreateCaseErrorCode = z.infer<typeof EvalCreateCaseErrorCode>;

export const EvalUpdateCaseErrorCode = z.enum(['file_mismatch', 'range_outside_hunks']);
export type EvalUpdateCaseErrorCode = z.infer<typeof EvalUpdateCaseErrorCode>;

export const EvalRunStartErrorCode = z.enum([
  'run_in_progress',
  'no_cases',
  'provider_key_missing',
]);
export type EvalRunStartErrorCode = z.infer<typeof EvalRunStartErrorCode>;

export const EvalCompareErrorCode = z.enum([
  'run_not_completed',
  'different_agents',
  'same_run',
]);
export type EvalCompareErrorCode = z.infer<typeof EvalCompareErrorCode>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
