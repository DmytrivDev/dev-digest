/* EvalMetricCard — RECALL / PRECISION / CITATION ACCURACY tile (AC-82).

   Composed from tokens instead of the design system's `MetricCard`: that one
   prints `Math.abs(delta).toFixed(2)`, which turns a 4-point change into
   "4.00" (plan assumption A6). The numbers here are whole percentages and
   whole points, the same units every other eval screen uses. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Sparkline } from "@devdigest/ui";
import { METRIC_NA } from "@/lib/eval";
import { s } from "./styles";

interface Props {
  metric: string;
  label: string;
  color: string;
  /** 0..1, or null → "n/a". */
  value: number | null;
  /** Whole points against the previous completed run, or null → no delta. */
  delta: number | null;
  /** Last completed values, oldest first. A line needs two points. */
  trend: number[];
}

export function EvalMetricCard({ metric, label, color, value, delta, trend }: Props) {
  const t = useTranslations("eval");
  const up = (delta ?? 0) > 0;
  const flat = delta === 0;
  const deltaColor = flat ? "var(--text-muted)" : up ? "var(--ok)" : "var(--crit)";
  const DeltaIcon = flat ? Icon.Slash : up ? Icon.ArrowUp : Icon.ArrowDown;

  return (
    <div data-testid={`metric-card-${metric}`} style={s.card}>
      <div style={s.top}>
        <span style={s.label}>{label}</span>
        {trend.length >= 2 && <Sparkline data={trend} color={color} w={56} h={20} />}
      </div>
      <div style={s.valueRow}>
        <span className="tnum" style={s.value}>
          {value == null ? (
            METRIC_NA
          ) : (
            <>
              {Math.round(value * 100)}
              <span style={s.suffix}>%</span>
            </>
          )}
        </span>
        {delta != null && (
          <span style={s.delta(deltaColor)}>
            <DeltaIcon size={12} />
            <span className="tnum">{t("compare.deltaPoints", { pts: Math.abs(delta) })}</span>
          </span>
        )}
      </div>
    </div>
  );
}
