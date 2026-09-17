import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/**
 * Drop low-confidence findings, optionally keep a single severity, sort by severity.
 *
 * `severity` is the per-run pill filter: `null` means "no filter". It is applied
 * AFTER the confidence filter so the pill counts (which tally the same
 * confidence-filtered set) always match the cards rendered below them.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Tally findings per severity — a plain group/count, never a model call.
 *
 * Always returns every pill severity so callers never handle `undefined`;
 * severities outside the contract enum (the DB column is plain text) are ignored,
 * the same way the server's `rollupSeverities` drops them.
 */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as Record<Severity, number>;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}
