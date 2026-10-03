/**
 * Constants of the PR Brief module (SPEC-03) — pure values, no I/O (ring 1).
 */

// ---- Model call and prompt budget (AC-61, AC-66) ----
/** Prompt ceiling in cl100k tokens, system prompt included (AC-61). */
export const INPUT_TOKEN_BUDGET = 8_000;
/** One generation is abandoned after this long (AC-88). */
export const MODEL_DEADLINE_MS = 120_000;
/**
 * Output ceiling (AC-66, amended 2026-10-03). A brief is ~1,500 tokens, but OpenRouter routes
 * some reasoning models to upstreams that still run a reasoning pass despite
 * `disableReasoning`; at 4,000 that cut the JSON mid-object (server INSIGHTS 2026-10-02).
 */
export const MODEL_MAX_TOKENS = 8_000;
export const MODEL_TEMPERATURE = 0.2;

// ---- Output caps (AC-79, AC-80) and text limits (AC-81) ----
export const MAX_RISKS = 5;
export const MAX_FOCUS = 6;
export const SUMMARY_MAX = 400;
export const RISK_TITLE_MAX = 120;
export const RISK_EXPLANATION_MAX = 600;
export const FOCUS_REASON_MAX = 200;

// ---- Budget tier caps (AC-62) ----
export const ISSUE_BODY_MAX_CHARS = 1_500;
export const DESCRIPTION_MAX_CHARS = 2_000;

// ---- Hard caps, applied BEFORE any token is counted (F9, OWASP A06) ----
// An input is attacker-controlled (PR body, linked-issue body, repo docs, file names) and
// js-tiktoken's BPE merge is super-linear on one long piece AND scales with UTF-8 BYTES, not
// characters (an astral letter is 4 bytes). So every cap below is in BYTES. Each is far above
// the tier cap of the same input (description 2,000 chars, issue body 1,500): an input that
// could fit the budget on its own is never cut below what tiers 2/3 would leave. A pre-cap
// that shortens an input is recorded as `truncated/over_budget`.
export const TITLE_MAX_BYTES = 1_024;
export const DESCRIPTION_PRECAP_BYTES = 32_000;
export const ISSUE_TITLE_MAX_BYTES = 1_024;
export const ISSUE_BODY_PRECAP_BYTES = 32_000;
export const SPEC_DOC_MAX_BYTES = 32_000;
/** Spec documents kept in total; later ones are dropped (tier 1 would drop them anyway). */
export const SPEC_TOTAL_MAX_BYTES = 64_000;
/** One free text of the prompt: about the whole token budget in bytes (~4 bytes / token). */
export const TEXT_PRECAP_BYTES = 32_000;
/** One path / symbol / name inside a list row. */
export const ITEM_MAX_BYTES = 300;
/**
 * More file rows than this cannot fit the budget anyway (a row is ≥ ~12 tokens); the lowest-churn
 * ones are dropped first, as tier 5 would, before any row is counted.
 */
export const MAX_FILE_ROWS = 300;
/** The same for blast callers (a line is ~15 tokens); lowest rank first, as tier 4 cuts them. */
export const MAX_BLAST_CALLERS = 400;
/**
 * The longest run of letters, of punctuation or of whitespace the prompt keeps in FREE text,
 * in UTF-8 bytes. cl100k pre-splits text into exactly such runs and the BPE merge of a run is
 * quadratic in its bytes, so a longer run is broken up (letters / punctuation) or shortened
 * (whitespace) when the prompt is rendered — the rendered prompt is what is counted and sent.
 */
export const MAX_RUN_BYTES = 32;
/**
 * The longest run a file path or symbol name may contain to be rendered VERBATIM (the model
 * echoes paths back and validation matches them against the PR's files, so they are never
 * split). A name with a longer run is rendered as an elision instead. 40 bytes keeps real
 * CamelCase names (`AbstractSingletonProxyFactoryBean` is 33).
 */
export const PATH_RUN_MAX_BYTES = 40;

// ---- Generate rate limit, per workspace (AC-92) ----
export const RATE_LIMIT_MAX = 3;
export const RATE_LIMIT_WINDOW_MS = 60_000;

// ---- Error codes (contract C-2) ----
export const ERR_FILES_UNAVAILABLE = 'files_unavailable';
export const ERR_GENERATION_IN_PROGRESS = 'generation_in_progress';
export const ERR_RATE_LIMITED = 'rate_limited';
export const ERR_LLM_NOT_CONFIGURED = 'llm_not_configured';
export const ERR_LLM_REQUEST_REJECTED = 'llm_request_rejected';
export const ERR_LLM_TIMEOUT = 'llm_timeout';
export const ERR_LLM_INVALID_OUTPUT = 'llm_invalid_output';
export const ERR_LLM_FAILED = 'llm_failed';

// ---- Input reason codes (AC-52 … AC-63) ----
export const REASON = {
  notDerived: 'not_derived',
  noLinkedIssue: 'no_linked_issue',
  githubUnavailable: 'github_unavailable',
  noneAttached: 'none_attached',
  cloneUnavailable: 'clone_unavailable',
  overBudget: 'over_budget',
  fileListTruncated: 'file_list_truncated',
  empty: 'empty',
  indexFailed: 'index_failed',
  noData: 'no_data',
} as const;

/** What a risk `kind` must look like to be kept; anything else becomes `RISK_KIND_FALLBACK` (F10). */
export const RISK_KIND_PATTERN = /^[a-z_]{1,32}$/;
export const RISK_KIND_FALLBACK = 'other';

/** Risk `kind` vocabulary the prompt asks for (C-4). Not enforced: an unknown kind is kept (AC-25). */
export const RISK_KINDS = ['security', 'db_migration', 'breaking_api', 'perf', 'deps'] as const;

/** The six `inputs` entries, in the fixed order every brief stores them (AC-60). */
export const INPUT_SOURCES = [
  'intent',
  'blast',
  'diff_stats',
  'description',
  'linked_issue',
  'specs',
] as const;

/**
 * Labels of the `<untrusted>` blocks (AC-67). CONSTANT on purpose — `wrapUntrusted` does not
 * escape its label, so a label must never be derived from PR or repo content. A spec block's
 * label is `specPrefix` + its index.
 */
export const UNTRUSTED_LABELS = {
  title: 'brief-pr-title',
  description: 'brief-pr-description',
  linkedIssue: 'brief-linked-issue',
  intent: 'brief-intent',
  blast: 'brief-blast',
  diffStats: 'brief-diff-stats',
  specPrefix: 'brief-spec-',
} as const;

/** Name of the system prompt template under `src/prompts/`. */
export const SYSTEM_PROMPT_FILE = 'brief.system.md';
