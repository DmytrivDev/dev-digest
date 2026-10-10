import type { ChartSeries } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import { METRICS } from "@/lib/eval";

/**
 * The three trend lines, one value per point. A metric that is null (a 0
 * denominator) stays `null` — the chart leaves a gap in that line instead of
 * drawing a false 0, and the point's other metrics still plot.
 */
export function trendChartSeries(points: readonly EvalTrendPoint[]): ChartSeries[] {
  return METRICS.map((m) => ({
    name: m.key,
    color: m.color,
    data: points.map((p) => p[m.key]),
  }));
}
