/* EvalMetrics — the four KPI cards of the Evals tab (RECALL, PRECISION,
   CITATION ACCURACY, CASES PASSED) for the latest completed run, each metric
   with its whole-point delta against the previous completed run (AC-27); "No
   runs yet" instead when no run has completed (AC-28).

   Composed from tokens rather than `MetricCard`: that one prints
   `Math.abs(delta).toFixed(2)`, so a 4-point change would read "4.00"
   (plan assumption A6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { deltaPoints, formatMetric } from "@/lib/eval";
import { s } from "./styles";

function Tile({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  const t = useTranslations("eval");
  const DeltaIcon = delta == null ? null : delta === 0 ? Icon.Slash : delta > 0 ? Icon.ArrowUp : Icon.ArrowDown;
  const color = delta == null || delta === 0 ? "var(--text-muted)" : delta > 0 ? "var(--ok)" : "var(--crit)";
  return (
    <div style={s.card}>
      <span style={s.label}>{label}</span>
      <div style={s.valueRow}>
        <span className="tnum" style={s.value}>
          {value}
        </span>
        {DeltaIcon && delta != null && (
          <span style={s.delta(color)}>
            <DeltaIcon size={12} />
            <span className="tnum">{t("compare.deltaPoints", { pts: Math.abs(delta) })}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function EvalMetrics({
  latest,
  previous,
}: {
  latest: EvalSuiteRun | null;
  previous: EvalSuiteRun | null;
}) {
  const t = useTranslations("eval");
  return (
    <div>
      <SectionLabel>{t("evalsTab.metricsTitle")}</SectionLabel>
      {latest ? (
        <div style={s.row}>
          <Tile
            label={t("common.metrics.recall")}
            value={formatMetric(latest.recall)}
            delta={deltaPoints(latest.recall, previous?.recall)}
          />
          <Tile
            label={t("common.metrics.precision")}
            value={formatMetric(latest.precision)}
            delta={deltaPoints(latest.precision, previous?.precision)}
          />
          <Tile
            label={t("common.metrics.citationAccuracy")}
            value={formatMetric(latest.citation_accuracy)}
            delta={deltaPoints(latest.citation_accuracy, previous?.citation_accuracy)}
          />
          <Tile
            label={t("common.metrics.casesPassed")}
            value={`${latest.cases_passed}/${latest.cases_scored}`}
          />
        </div>
      ) : (
        <div style={s.empty}>{t("evalsTab.noRuns")}</div>
      )}
    </div>
  );
}
