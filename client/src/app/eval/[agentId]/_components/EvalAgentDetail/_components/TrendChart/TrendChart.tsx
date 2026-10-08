/* TrendChart — metric lines over the last completed runs, on a 0–100 % axis
   (AC-83). The design system's LineChart defaults to a 0.6–1.0 domain, which
   would clip a 30 % precision out of the plot, so the domain is set here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, LineChart, SectionLabel } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import { METRICS, TREND_Y_MAX, TREND_Y_MIN, TREND_Y_TICKS } from "../../constants";
import { trendSeries } from "../../helpers";
import { s } from "./styles";

export function TrendChart({ trend }: { trend: readonly EvalTrendPoint[] }) {
  const t = useTranslations("eval");
  return (
    <Card style={s.card}>
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
        series={trendSeries(trend)}
        w={900}
        h={200}
        yMin={TREND_Y_MIN}
        yMax={TREND_Y_MAX}
        ticks={TREND_Y_TICKS}
      />
    </Card>
  );
}
