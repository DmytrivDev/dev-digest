/* TrendChart — metric lines over the last completed runs of the dashboard, on a
   0–100 % axis (AC-83). The chart itself is the shared EvalTrendChart (the
   Evals tab draws the same one); here it stays dot-less and gains only the
   per-point tooltip (SPEC-05 AC-59, AC-60). A run with any null metric is left
   out of all three lines, as before. */
"use client";

import React from "react";
import type { EvalTrendPoint } from "@devdigest/shared";
import { EvalTrendChart } from "@/components/EvalTrendChart";
import { trendPoints } from "../../helpers";
import { s } from "./styles";

export function TrendChart({ trend }: { trend: readonly EvalTrendPoint[] }) {
  return (
    <div style={s.wrap}>
      <EvalTrendChart points={trendPoints(trend)} dots={false} />
    </div>
  );
}
