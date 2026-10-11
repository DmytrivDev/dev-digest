import type { CiRun, CiRunStatus, CiRunVerdict } from "@devdigest/shared";
import { SEV, type Severity } from "@devdigest/ui";

/** Badge colours of a run status — CSS variables only. */
export function runStatusTone(status: CiRunStatus): { color: string; bg: string } {
  switch (status) {
    case "succeeded":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
    case "failed":
      return { color: "var(--crit)", bg: "var(--crit-bg)" };
    case "running":
      return { color: "var(--accent-text)", bg: "var(--accent-bg)" };
    case "rejected":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
  }
}

export function verdictTone(verdict: CiRunVerdict): { color: string; bg: string } {
  return verdict === "blocked"
    ? { color: "var(--crit)", bg: "var(--crit-bg)" }
    : { color: "var(--ok)", bg: "var(--ok-bg)" };
}

/** "12s", "1m 4s"; "—" when the run has no duration. */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  return m > 0 ? `${m}m ${total % 60}s` : `${total}s`;
}

export interface FindingCount {
  severity: Severity;
  color: string;
  icon: (typeof SEV)[Severity]["icon"];
  count: number;
}

/** Non-zero per-severity counts (critical, warning, suggestion); empty → render "—". */
export function findingCounts(run: Pick<CiRun, "critical" | "warning" | "suggestion">): FindingCount[] {
  const entries: [Severity, number | null][] = [
    ["CRITICAL", run.critical],
    ["WARNING", run.warning],
    ["SUGGESTION", run.suggestion],
  ];
  return entries
    .filter(([, n]) => n != null && n > 0)
    .map(([severity, n]) => ({ severity, color: SEV[severity].c, icon: SEV[severity].icon, count: n as number }));
}

/** Only http(s) links reach an anchor — the URL comes from the API, not from us. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
