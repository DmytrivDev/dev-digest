/* eval.ts — pure helpers for the eval pipeline screens (SPEC-04): metric and
   delta formatting, the per-case result line, the expectation JSON validator,
   and the maps from API reason codes to i18n keys.

   No React and no hooks in here, so every rule is testable without a renderer.
   This module VALUE-imports `EvalExpectation` from `@devdigest/shared`, which
   turns a type-only dependency into a runtime one — `pnpm build` must be run
   after touching it (client/INSIGHTS.md, 2026-09-18). */

import { EvalExpectation } from "@devdigest/shared";
import type {
  EvalAlert,
  EvalCaseOutcome,
  EvalCompareErrorCode,
  EvalCreateCaseErrorCode,
  EvalRunStartErrorCode,
  EvalUpdateCaseErrorCode,
} from "@devdigest/shared";
import { ApiError } from "./api";

// ---- Metric formatting (AC-77) ---------------------------------------------

/** What a metric with a zero denominator shows. */
export const METRIC_NA = "n/a";

/** A 0..1 metric as a whole percentage; `null` → "n/a". 0.8249 → "82%". */
export function formatMetric(v: number | null | undefined): string {
  if (v == null) return METRIC_NA;
  return `${Math.round(v * 100)}%`;
}

/**
 * Whole-point change between two 0..1 metrics (`new − old`), or `null` when
 * either side is missing. It is the difference of the two DISPLAYED
 * percentages, so "78% → 82%" always reads "4 pts" — never "3" or "5".
 */
export function deltaPoints(
  newV: number | null | undefined,
  oldV: number | null | undefined,
): number | null {
  if (newV == null || oldV == null) return null;
  return Math.round(newV * 100) - Math.round(oldV * 100);
}

// ---- Result line (AC-30) and last-run line (AC-44) --------------------------

/** `<file>:<start>–<end>` (en dash), as the spec writes every location. */
export function expectationLoc(exp: Pick<EvalExpectation, "file" | "start_line" | "end_line">) {
  return `${exp.file}:${exp.start_line}–${exp.end_line}`;
}

export type ResultLineParts =
  | { variant: "mustFind"; loc: string; n: number }
  | { variant: "mustNotFlag"; loc: string; n: number }
  | { variant: "errored"; reason: string }
  | { variant: "never" };

/**
 * Which of the four result lines a case shows. The kind and location come from
 * the case's CURRENT expectation; `n` is the number of grounded findings that
 * matched it in the latest run containing the case.
 */
export function resultLineParts(
  outcome: EvalCaseOutcome | null | undefined,
  expectation: EvalExpectation,
): ResultLineParts {
  if (!outcome) return { variant: "never" };
  if (outcome.status === "errored") {
    return { variant: "errored", reason: outcome.error_reason ?? "unknown" };
  }
  const variant = expectation.kind === "must_find" ? "mustFind" : "mustNotFlag";
  return { variant, loc: expectationLoc(expectation), n: outcome.findings_matched };
}

export type LastRunParts =
  | { variant: "never" }
  | { variant: "errored"; reason: string }
  | {
      variant: "passed" | "failed";
      line: Exclude<ResultLineParts, { variant: "errored" | "never" }>;
      /** One decimal, no unit: "1.8". */
      seconds: string;
      /** Pass to `formatCost` — `null` renders "—". */
      costUsd: number | null;
    };

/** The case modal's "Last run …" line, as data. */
export function lastRunParts(
  outcome: EvalCaseOutcome | null | undefined,
  expectation: EvalExpectation,
): LastRunParts {
  const line = resultLineParts(outcome, expectation);
  if (!outcome || line.variant === "never") return { variant: "never" };
  if (line.variant === "errored") return { variant: "errored", reason: line.reason };
  return {
    variant: outcome.pass ? "passed" : "failed",
    line,
    seconds: (outcome.duration_ms / 1000).toFixed(1),
    costUsd: outcome.cost_usd,
  };
}

// ---- Expectation JSON (AC-39 / AC-40) ---------------------------------------

export type ExpectationParse = { ok: true; value: EvalExpectation } | { ok: false };

/** Editor text → a valid expectation, or `{ ok: false }` (bad JSON or bad shape). */
export function parseExpectationText(text: string): ExpectationParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const parsed = EvalExpectation.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

/** What the Expected-output pane starts with. */
export function expectationText(exp: EvalExpectation): string {
  return JSON.stringify(exp, null, 2);
}

// ---- Regression banner (AC-86) ----------------------------------------------

export type AlertDrop = EvalAlert["drops"][number];

/**
 * Params for `eval:detail.banner.drop` ("{metric} dropped {pts} pts on
 * v{newVersion} vs v{oldVersion}"). `pts` is positive; the caller resolves
 * `metric` through `eval:common.metricName.<drop.metric>`.
 */
export function alertDropParams(drop: AlertDrop) {
  return {
    metric: drop.metric,
    pts: Math.round(drop.old_value * 100) - Math.round(drop.new_value * 100),
    newVersion: drop.new_version,
    oldVersion: drop.old_version,
  };
}

// ---- Reason code → i18n key (AC-8 / AC-64) ----------------------------------
// Every value is a key inside the namespace named in the comment. A completeness
// test (eval.test.ts) loads the JSON and checks that each one resolves.

/** Keys in the `prReview` namespace. */
export const CREATE_CASE_ERROR_KEY: Record<EvalCreateCaseErrorCode, string> = {
  finding_not_triaged: "finding.evalCase.errors.finding_not_triaged",
  not_agent_finding: "finding.evalCase.errors.not_agent_finding",
  agent_missing: "finding.evalCase.errors.agent_missing",
  patch_missing: "finding.evalCase.errors.patch_missing",
  range_outside_hunks: "finding.evalCase.errors.range_outside_hunks",
  diff_too_large: "finding.evalCase.errors.diff_too_large",
};
/** Key in the `prReview` namespace for any other failure. */
export const CREATE_CASE_ERROR_FALLBACK = "finding.evalCase.errors.generic";

/** Keys in the `eval` namespace. */
export const RUN_START_ERROR_KEY: Record<EvalRunStartErrorCode, string> = {
  run_in_progress: "errors.run_in_progress",
  no_cases: "errors.no_cases",
  provider_key_missing: "errors.provider_key_missing",
};
export const UPDATE_CASE_ERROR_KEY: Record<EvalUpdateCaseErrorCode, string> = {
  file_mismatch: "errors.file_mismatch",
  range_outside_hunks: "errors.range_outside_hunks",
};
export const COMPARE_ERROR_KEY: Record<EvalCompareErrorCode, string> = {
  run_not_completed: "errors.run_not_completed",
  different_agents: "errors.different_agents",
  same_run: "errors.same_run",
};
export const EVAL_ERROR_RATE_LIMITED = "errors.rateLimited";
export const EVAL_ERROR_GENERIC = "errors.generic";

function keyForCode(err: unknown, map: Record<string, string>, fallback: string): string {
  const code = err instanceof ApiError ? err.code : undefined;
  return code !== undefined && Object.prototype.hasOwnProperty.call(map, code)
    ? map[code]!
    : fallback;
}

/** `prReview` key for a failed create-case request. */
export function createCaseErrorKey(err: unknown): string {
  return keyForCode(err, CREATE_CASE_ERROR_KEY, CREATE_CASE_ERROR_FALLBACK);
}

/** `eval` key for a failed run start: 429 is the rate limit, 409/422 carry a code. */
export function runStartErrorKey(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) return EVAL_ERROR_RATE_LIMITED;
  return keyForCode(err, RUN_START_ERROR_KEY, EVAL_ERROR_GENERIC);
}

/** `eval` key for a failed case update. */
export function updateCaseErrorKey(err: unknown): string {
  return keyForCode(err, UPDATE_CASE_ERROR_KEY, EVAL_ERROR_GENERIC);
}

/** `eval` key for a failed compare. */
export function compareErrorKey(err: unknown): string {
  return keyForCode(err, COMPARE_ERROR_KEY, EVAL_ERROR_GENERIC);
}
