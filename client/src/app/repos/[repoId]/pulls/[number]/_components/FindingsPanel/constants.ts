import type { FindingActionKind, Severity } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};

/**
 * Severities the pill row can show, in display order. Only levels that actually
 * occur in the run get a pill (the design's rule), so this is the candidate list,
 * not what is rendered. `INFO` is a UI-token-only level — it is not in the
 * `Severity` contract enum and never reaches a pill.
 */
export const SEVERITY_PILL_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
