import type { ChartSeries } from "@devdigest/ui";
import type { EvalSuiteRun, EvalTrendPoint } from "@devdigest/shared";
import { deltaPoints } from "@/lib/eval";
import { COMPARE_COUNT, MAX_TREND_POINTS, METRICS, type MetricKey } from "./constants";

/** The runs a metric can be read from: completed ones, newest first (input order). */
export function completedRuns(runs: readonly EvalSuiteRun[]): EvalSuiteRun[] {
  return runs.filter((r) => r.status === "completed");
}

export interface MetricCardData {
  /** 0..1 value of the latest completed run, or null (no run, or a 0 denominator). */
  value: number | null;
  /** Whole-point change against the previous completed run, or null. */
  delta: number | null;
  /** The last (up to 20) completed values, oldest first, nulls skipped. */
  spark: number[];
}

/** What one metric card shows (AC-82). */
export function metricCardData(
  runs: readonly EvalSuiteRun[],
  trend: readonly EvalTrendPoint[],
  key: MetricKey,
): MetricCardData {
  const [latest, previous] = completedRuns(runs);
  const spark = trend
    .map((p) => p[key])
    .filter((v): v is number => v != null)
    .slice(-MAX_TREND_POINTS);
  return {
    value: latest?.[key] ?? null,
    delta: latest && previous ? deltaPoints(latest[key], previous[key]) : null,
    spark,
  };
}

/**
 * The three trend lines. `LineChart` takes equal-length number arrays, so a
 * point where any metric is null (a 0 denominator) is left out of ALL three
 * rather than drawn as a false 0.
 */
export function trendSeries(trend: readonly EvalTrendPoint[]): ChartSeries[] {
  const points = trend
    .filter((p) => METRICS.every((m) => p[m.key] != null))
    .slice(-MAX_TREND_POINTS);
  return METRICS.map((m) => ({
    name: m.key,
    color: m.color,
    data: points.map((p) => p[m.key] as number),
  }));
}

/** Add `id` to the selection, or remove it. A third pick is ignored. */
export function toggleSelected(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= COMPARE_COUNT ? [...selected] : [...selected, id];
}

/** Whether a run's checkbox is disabled: not completed, or two others are already picked. */
export function isSelectDisabled(run: EvalSuiteRun, selected: readonly string[]): boolean {
  if (run.status !== "completed") return true;
  return selected.length >= COMPARE_COUNT && !selected.includes(run.id);
}
