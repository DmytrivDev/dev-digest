/* Pure rules of the Evals tab — kept out of the components so they test without
   a renderer. Type-only imports from @devdigest/shared (a value import would
   break `next build`, client/INSIGHTS.md 2026-09-18). */

import type { Category, Severity } from "@devdigest/ui";
import { SEV, CAT } from "@devdigest/ui";
import type { EvalCaseOutcome, EvalSuiteRun } from "@devdigest/shared";
import type { ResultLineParts } from "@/lib/eval";
import type { CaseStatus } from "./constants";

/** `t` of a next-intl namespace, narrowed to what these helpers need. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Which of the four status icons a case shows, from its latest outcome (AC-29). */
export function caseStatus(outcome: EvalCaseOutcome | null | undefined): CaseStatus {
  if (!outcome) return "never";
  if (outcome.status === "errored") return "errored";
  return outcome.pass ? "pass" : "fail";
}

/** Runs sorted newest first (the API already does; this does not rely on it). */
export function newestFirst(runs: readonly EvalSuiteRun[]): EvalSuiteRun[] {
  return [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/**
 * The latest completed run and the one before it: the cards show the first, the
 * deltas compare it with the second (AC-27). `running`/`failed` runs are skipped.
 */
export function latestAndPrevious(runs: readonly EvalSuiteRun[]) {
  const completed = newestFirst(runs).filter((r) => r.status === "completed");
  return { latest: completed[0] ?? null, previous: completed[1] ?? null };
}

/** The result line of a case (AC-30) as text. */
export function resultLineText(t: Translate, parts: ResultLineParts): string {
  switch (parts.variant) {
    case "mustFind":
      return t("common.result.mustFind", { loc: parts.loc, n: parts.n });
    case "mustNotFlag":
      return t("common.result.mustNotFlag", { loc: parts.loc, n: parts.n });
    case "errored":
      return t("common.result.errored", { reason: parts.reason });
    case "never":
      return t("common.result.never");
  }
}

/** A stored severity string as a design-system severity, or null when unknown. */
export function severityOf(raw: string): Severity | null {
  return Object.prototype.hasOwnProperty.call(SEV, raw) ? (raw as Severity) : null;
}

/** A stored category string as a design-system category, or null when unknown. */
export function categoryOf(raw: string): Category | null {
  return Object.prototype.hasOwnProperty.call(CAT, raw) ? (raw as Category) : null;
}
