/* TooltipBody — what the trend tooltip says about one run: when it started, the
   agent version, its cost, and the three metrics. Every value arrives as
   display text and is rendered as a React text child, never as markup. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { METRICS, type TrendTooltipParts } from "@/lib/eval";
import { s } from "./styles";

/** Which tooltip key and which part of `TrendTooltipParts` each metric line uses. */
const LINES = [
  { metric: METRICS[0], tooltipKey: "recall", part: "recall" },
  { metric: METRICS[1], tooltipKey: "precision", part: "precision" },
  { metric: METRICS[2], tooltipKey: "citation", part: "citation" },
] as const;

export function TooltipBody({ parts }: { parts: TrendTooltipParts }) {
  const t = useTranslations("eval");
  return (
    <div>
      <div style={s.head}>
        <span style={s.when}>{parts.when}</span>
        {parts.version !== null && (
          <span style={s.version}>{t("trend.tooltip.version", { version: parts.version })}</span>
        )}
      </div>
      <div style={s.cost}>{t("trend.tooltip.cost", { cost: parts.cost })}</div>
      {LINES.map((l) => (
        <div key={l.metric.key} style={s.row}>
          <span style={s.swatch(l.metric.color)} />
          <span className="tnum">{t(`trend.tooltip.${l.tooltipKey}`, { value: parts[l.part] })}</span>
        </div>
      ))}
    </div>
  );
}
