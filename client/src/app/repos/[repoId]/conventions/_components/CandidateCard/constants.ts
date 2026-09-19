/** Above this, the confidence bar reads as green rather than amber (mock's rule). */
export const HIGH_CONFIDENCE = 0.85;

/** Width of the confidence bar, in px — wide enough to read, narrow enough to
    stay a footnote beside the rule it qualifies. */
export const CONFIDENCE_BAR_WIDTH = 90;

/** Left rail colour per triage state — the card's status at a glance. */
export const STATUS_RAIL = {
  pending: "var(--border)",
  accepted: "var(--ok)",
  rejected: "var(--text-muted)",
} as const;
