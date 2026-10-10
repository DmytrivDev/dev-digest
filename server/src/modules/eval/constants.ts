import { EVAL_CASE_MAX_BYTES, EVAL_CASE_NAME_MAX } from '@devdigest/shared';
import type {
  EvalCaseInputErrorCode,
  EvalCompareErrorCode,
  EvalCreateCaseErrorCode,
  EvalRunStartErrorCode,
  EvalUpdateCaseErrorCode,
} from '@devdigest/shared';

/**
 * Eval pipeline constants (SPEC-04). The reason-code maps below are checked against the
 * shared enums (type imports), so a code that drifts from the wire contract fails
 * typecheck instead of shipping a string no client maps. The one value import is the
 * size cap, so a single number governs both packages (SPEC-05).
 */

/** Per-case deadline for one engine review during a suite run (AC-55). */
export const CASE_DEADLINE_MS = 120_000;

/**
 * A run still `running` this long after it started is reaped as `failed: interrupted`
 * (AC-58). NOTE: 15 min < 8 cases x 120 s — see the plan's spec follow-up 2; the
 * executor's final write is conditional on `status = 'running'` for that reason.
 */
export const STALE_RUN_MS = 15 * 60_000;

/** Largest stored case diff, in UTF-8 bytes (AC-23): 200 KB. Same number as the contract's. */
export const MAX_CASE_DIFF_BYTES = EVAL_CASE_MAX_BYTES;

/** Longest generated case name / slug (AC-16), suffix included. */
export const CASE_NAME_MAX = EVAL_CASE_NAME_MAX;

/** Used when a title has no ASCII letter or digit to build a slug from. */
export const CASE_NAME_FALLBACK = 'eval-case';

/** Runs returned by the dashboard / run history (AC-84). */
export const RUN_LIST_LIMIT = 20;

/** A metric must fall by at least this much between two completed runs to alert (AC-85). */
export const REGRESSION_DROP = 0.02;

/** Float slack so a drop of exactly 0.02 (0.82 - 0.80 = 0.01999…) still counts. */
export const REGRESSION_EPSILON = 1e-9;

/** Past this many lines on either side the prompt diff degrades to remove-all/add-all (AC-92). */
export const MAX_LCS_LINES = 1200;

/** Reason codes of `POST /findings/:id/eval-case` (AC-18…AC-23). */
export const CREATE_CASE_ERROR = {
  notTriaged: 'finding_not_triaged',
  notAgentFinding: 'not_agent_finding',
  agentMissing: 'agent_missing',
  patchMissing: 'patch_missing',
  rangeOutsideHunks: 'range_outside_hunks',
  diffTooLarge: 'diff_too_large',
} as const satisfies Record<string, EvalCreateCaseErrorCode>;

/** Reason codes of `PATCH /eval/cases/:id` (AC-41, AC-42). */
export const UPDATE_CASE_ERROR = {
  fileMismatch: 'file_mismatch',
  rangeOutsideHunks: 'range_outside_hunks',
} as const satisfies Record<string, EvalUpdateCaseErrorCode>;

/**
 * Reason codes about the pasted diff of a manual case: `POST /agents/:id/eval/cases` and
 * the diff/meta part of `PATCH /eval/cases/:id` (SPEC-05 AC-25, AC-36, AC-37).
 */
export const CASE_INPUT_ERROR = {
  diffTooLarge: 'diff_too_large',
  diffUnparseable: 'diff_unparseable',
  multiFileDiff: 'multi_file_diff',
  diffFrozen: 'diff_frozen',
} as const satisfies Record<string, EvalCaseInputErrorCode>;

/** Reason codes of `POST /agents/:id/eval/runs` (AC-51…AC-53). */
export const RUN_START_ERROR = {
  runInProgress: 'run_in_progress',
  noCases: 'no_cases',
  providerKeyMissing: 'provider_key_missing',
} as const satisfies Record<string, EvalRunStartErrorCode>;

/** Reason codes of `GET /eval/compare` (AC-95…AC-97). */
export const COMPARE_ERROR = {
  runNotCompleted: 'run_not_completed',
  differentAgents: 'different_agents',
  sameRun: 'same_run',
  notSuiteRun: 'not_suite_run',
} as const satisfies Record<string, EvalCompareErrorCode>;
