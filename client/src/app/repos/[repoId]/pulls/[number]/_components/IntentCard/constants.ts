import type { IntentConfidence } from "@devdigest/shared";

/**
 * Tier → colour for the confidence `Badge`. `ConfidenceNum` is deliberately
 * NOT used here: it renders a percentage, and this confidence is a discrete
 * tier computed from which sources resolved — a "%" would manufacture
 * calibrated-looking precision the data cannot support (R5).
 */
export const CONFIDENCE_COLOR: Record<IntentConfidence, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

/** Rows of skeleton shown while the intent query is loading. */
export const SKELETON_ROWS = 3;
