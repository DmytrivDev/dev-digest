import type { EvalSuiteRun } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { formatWhen } from "@/lib/datetime";
import { formatMetric } from "@/lib/eval";

/** What a cell without a value shows (no run yet, or a run with no pass count). */
export const NO_VALUE = "—";

export interface RunCells {
  recall: string;
  precision: string;
  citation: string;
  pass: string;
  cost: string;
  ranAt: string;
}

/**
 * The display strings of an agent's latest run. A run that is not `completed`
 * has no pass count worth showing (a running run is mid-way, a failed one
 * scored nothing), so it shows "—"; its metrics stay "n/a" (AC-77).
 */
export function runCells(run: EvalSuiteRun): RunCells {
  return {
    recall: formatMetric(run.recall),
    precision: formatMetric(run.precision),
    citation: formatMetric(run.citation_accuracy),
    pass: run.status === "completed" ? `${run.cases_passed}/${run.cases_scored}` : NO_VALUE,
    cost: formatCost(run.cost_usd),
    ranAt: formatWhen(run.started_at),
  };
}
