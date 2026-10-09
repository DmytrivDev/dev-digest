/* MetricTrend — the "Metric trend" card of the Evals tab (SPEC-05 E): the
   recall / precision / citation lines over the agent's completed runs, one dot
   per run, with a tooltip on hover or focus. The chart is the shared
   EvalTrendChart the dashboard draws. The runs come from the tab's polled
   `useEvalRuns` list, so a run that completes adds its point without a reload;
   nothing here is copied into state.

   Loading shows nothing (the metrics block above has its own empty state);
   an error or fewer than two completed runs shows a single line instead of
   the chart. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { EvalTrendChart } from "@/components/EvalTrendChart";
import { evalsTabTrendPoints } from "../../helpers";
import { s } from "./styles";

/** A trend needs a line, and a line needs two points. */
const MIN_POINTS = 2;

export function MetricTrend({
  runs,
  isLoading,
  isError,
}: {
  runs: readonly EvalSuiteRun[];
  isLoading: boolean;
  isError: boolean;
}) {
  const t = useTranslations("eval");
  if (isError) {
    return <div style={{ ...s.wrap, ...s.message }}>{t("trend.loadError")}</div>;
  }
  if (isLoading) return null;
  const points = evalsTabTrendPoints(runs);
  if (points.length < MIN_POINTS) {
    return <div style={{ ...s.wrap, ...s.message }}>{t("trend.notEnough")}</div>;
  }
  return (
    <div style={s.wrap}>
      <EvalTrendChart points={points} dots />
    </div>
  );
}
