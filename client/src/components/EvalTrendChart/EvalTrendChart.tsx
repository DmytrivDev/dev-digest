/* EvalTrendChart — the three metric lines over a run history, on a 0–100 % axis
   with a legend and a point tooltip (date, version, cost, metrics). Shared by
   the eval dashboard and the agent Evals tab, which feed it the same
   `EvalTrendPoint` shape. `dots` draws a visible dot per point (the tab does;
   the dashboard stays dot-less). The domain is set here: the design system's
   LineChart defaults to 0.6–1.0, which would clip a 30 % precision. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, LineChart, SectionLabel } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import { METRICS, TREND_Y_MAX, TREND_Y_MIN, TREND_Y_TICKS, trendTooltipParts } from "@/lib/eval";
import { TooltipBody } from "./_components/TooltipBody";
import { trendChartSeries } from "./helpers";
import { s } from "./styles";

export function EvalTrendChart({
  points,
  dots = false,
}: {
  points: readonly EvalTrendPoint[];
  dots?: boolean;
}) {
  const t = useTranslations("eval");
  return (
    <Card>
      <div style={s.top}>
        <SectionLabel icon="TrendingUp">{t("detail.metricTrend")}</SectionLabel>
        <div style={s.legend}>
          {METRICS.map((m) => (
            <span key={m.key} style={s.legendItem}>
              <span style={s.swatch(m.color)} />
              {t(m.legendKey)}
            </span>
          ))}
        </div>
      </div>
      <LineChart
        series={trendChartSeries(points)}
        w={900}
        h={200}
        yMin={TREND_Y_MIN}
        yMax={TREND_Y_MAX}
        ticks={TREND_Y_TICKS}
        dots={dots}
        tooltip={{
          label: t("trend.chartLabel"),
          render: (i) => {
            const point = points[i];
            return point ? <TooltipBody parts={trendTooltipParts(point)} /> : null;
          },
        }}
      />
    </Card>
  );
}
