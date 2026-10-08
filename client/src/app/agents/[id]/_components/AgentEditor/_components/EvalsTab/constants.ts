import type { IconName } from "@devdigest/ui";

/** How many of the agent's latest runs the Run history section lists (AC-33). */
export const RUN_HISTORY_LIMIT = 5;

/** URL search param holding the open case; `?tab=evals&case=<id>` deep-links the modal (AC-5). */
export const CASE_PARAM = "case";

export type CaseStatus = "pass" | "fail" | "errored" | "never";

/** Status icon + token colour of a case row (AC-29). */
export const CASE_STATUS_ICON: Record<CaseStatus, { icon: IconName; color: string }> = {
  pass: { icon: "CheckCircle", color: "var(--ok)" },
  fail: { icon: "XCircle", color: "var(--crit)" },
  errored: { icon: "AlertTriangle", color: "var(--warn)" },
  never: { icon: "Dot", color: "var(--text-muted)" },
};
