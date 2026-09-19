import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

/**
 * Length limits the skills API enforces on the fields that are rendered into a
 * review prompt.
 *
 * They live in the contract, not only on the server, because both sides need
 * the same number: the server rejects an over-long field with a 422, and the
 * editor has to be able to say so BEFORE the round trip. A client-side copy
 * would drift silently the first time the server's cap moved.
 *
 * Deliberately NOT applied to the `Skill` schema above. `Skill` parses what the
 * API RETURNS, and a row that predates a cap (or was written by the seed, which
 * inserts straight through Drizzle) legitimately exceeds it — tightening the
 * read schema would make such a row unreadable instead of merely uneditable.
 * The caps belong on the write path only.
 *
 * `body` is not here: its cap is a 512 KB anti-abuse ceiling nobody reaches by
 * typing, so the editor has nothing useful to do with it.
 */
export const SKILL_LIMITS = {
  name: 120,
  description: 200,
} as const;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  /**
   * How many agents carry this skill right now, from `agent_skills`.
   *
   * Only the LIST endpoint reports it: the whole page costs one grouped query,
   * while a single-skill read would need a second query nobody asked for.
   * Absent therefore means "not reported here" and NEVER zero — the same rule
   * the run trace's per-slot token counts follow. A card that shows nothing is
   * correct; a card that shows 0 for an unreported count is a lie.
   *
   * Counts every link, regardless of whether the agent itself is enabled — the
   * question the card answers is "will deleting this break something", and a
   * disabled agent is still something.
   */
  agent_count: z.number().int().nullish(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

/**
 * One immutable snapshot of a skill's BODY, written whenever the body changes.
 *
 * Only the body is versioned — it is the only field that reaches a model, so a
 * rename cannot change what a past run was told. History is append-only:
 * restoring an old version writes a NEW version carrying that text rather than
 * rewinding the counter, so a run that cites v3 can always be explained.
 */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** An agent this skill is linked to right now. */
export const SkillAgentUsage = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  /** False = linked, but the agent itself is switched off. */
  agent_enabled: z.boolean(),
});
export type SkillAgentUsage = z.infer<typeof SkillAgentUsage>;

/**
 * Usage statistics for one skill.
 *
 * Read every number here as CO-OCCURRENCE, not causation. A run carries several
 * skills at once, so `findings` counts findings produced by runs whose prompt
 * included this skill — not findings this skill caused. There is no per-skill
 * attribution in the data and inventing one would be a precise-looking lie.
 *
 * `used_by` comes from the CURRENT links (`agent_skills`); everything else
 * comes from `run_skills`, which records history. The two can legitimately
 * disagree — a skill detached yesterday still has runs.
 */
export const SkillStats = z.object({
  /** Window the run-derived numbers cover, in days. */
  window_days: z.number().int(),
  /** Agents carrying this skill right now. */
  used_by: z.array(SkillAgentUsage),
  /** Runs in the window whose prompt included this skill. */
  runs: z.number().int(),
  /** Findings produced by those runs, by severity. */
  findings: z.number().int(),
  findings_by_severity: z.record(z.string(), z.number().int()),
  findings_by_category: z.record(z.string(), z.number().int()),
  /**
   * Accepted ÷ (accepted + dismissed) over those findings. Null when nobody has
   * triaged any of them — an untriaged skill is not a 0% skill.
   */
  accept_rate: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  /** Tokens this skill contributed across those runs; null when never priced. */
  tokens: z.number().int().nullable(),
  /** The version most recently carried into a run; null when never run. */
  last_version_used: z.number().int().nullable(),
  /** ISO timestamp of the newest run carrying it; null when never run. */
  last_used_at: z.string().nullable(),
});
export type SkillStats = z.infer<typeof SkillStats>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;

// ---- Conventions ----
// Declared after Agents on purpose: `ConventionScanReport` reuses `Provider`,
// and a `const` referenced above its own declaration throws at import time.

/**
 * What kind of rule a candidate is. A fixed list rather than free text: the
 * studio groups candidates by category, and the enum goes into the model's
 * output schema so it cannot invent a tenth bucket that nothing renders.
 */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'typing',
  'validation',
  'error_handling',
  'testing',
  'imports',
  'formatting',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/**
 * Triage state — three values, not a boolean. A REJECTED candidate and one
 * NOBODY HAS TRIAGED YET must stay apart: a re-scan replaces the untriaged ones
 * and must never resurrect a rejection.
 */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * Why a proposal was thrown away before anyone saw it. Reported per scan, not
 * stored: a dropped candidate has no row.
 */
export const ConventionDropReason = z.enum([
  'empty_rule',
  'unknown_file',
  'line_out_of_range',
  'snippet_mismatch',
  'duplicate_in_batch',
]);
export type ConventionDropReason = z.infer<typeof ConventionDropReason>;

/**
 * One convention candidate as the API serves it.
 *
 * Evidence is the whole point: every candidate names a file AND a line, and the
 * server has re-read that line and matched the snippet before a row ever
 * reaches this shape — so `evidence_path` / `evidence_line` are required, not
 * nullish, even though the columns behind them are nullable for legacy rows.
 * `evidence_url` is a GitHub permalink pinned to the sha the scan ran against;
 * it is null only when the repo had no resolvable head at that moment.
 */
export const ConventionCandidate = z.object({
  id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int().positive(),
  evidence_snippet: z.string(),
  evidence_url: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/**
 * What one scan did. Returned with the candidates and deliberately NOT stored —
 * the candidates are the persisted result, and a report table would be a second
 * source of truth for the same scan.
 *
 * It exists so a thin result is explainable instead of mysterious: `code_samples`
 * and `config_samples` prove which files the model actually saw (selection is
 * pure code, no model), and `dropped` says how many proposals failed evidence
 * validation and why.
 */
export const ConventionScanReport = z.object({
  head_sha: z.string().nullable(),
  provider: Provider,
  model: z.string(),
  config_samples: z.array(z.string()),
  code_samples: z.array(z.string()),
  proposed: z.number().int(),
  kept: z.number().int(),
  dropped: z.array(z.object({ rule: z.string(), reason: ConventionDropReason })),
  /** Candidates that were not already on file — the rest kept their triage. */
  created: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type ConventionScanReport = z.infer<typeof ConventionScanReport>;

/** `POST /repos/:id/conventions/extract` — the stored candidates plus what the scan did. */
export const ConventionScanResult = z.object({
  candidates: z.array(ConventionCandidate),
  scan: ConventionScanReport,
});
export type ConventionScanResult = z.infer<typeof ConventionScanResult>;

/**
 * Write caps for a candidate the user edits by hand.
 *
 * In the contract, like `SKILL_LIMITS`, so the editor can warn before the round
 * trip instead of learning the cap from a 422. `rule` is rendered into a review
 * prompt once the skill is assembled, which is why it is capped at all.
 */
export const CONVENTION_LIMITS = { rule: 300 } as const;

/**
 * The `repo-conventions` skill as it WOULD be saved — `GET .../skill/draft`.
 *
 * Exists so the modal can show and edit the real thing before anything is
 * written. The body is assembled SERVER-side by the same pure function the save
 * path uses, so a draft shown and then saved unchanged is byte-identical — which
 * is what keeps "an unchanged set burns no skill version" true rather than
 * something the client could accidentally defeat by re-rendering the markdown.
 */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string(),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;
