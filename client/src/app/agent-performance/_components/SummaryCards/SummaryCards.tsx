"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@devdigest/ui";
import type { CostBasis, PerfSummary } from "@devdigest/shared";
import { EstimateLabel } from "@/components/EstimateLabel";
import { formatCount, formatPercent } from "@/lib/agent-performance";
import { formatCost } from "@/lib/cost";
import { s } from "./styles";

/* The four headline cards. No deltas and no sparklines (spec non-goals). */
export function SummaryCards({
  summary,
  costBasis,
}: {
  summary: PerfSummary;
  costBasis: CostBasis;
}) {
  const t = useTranslations("agentPerformance");
  const unpriced = summary.runs - summary.priced_runs;
  const decided = summary.accepted + summary.dismissed;
  const hasRate = summary.accept_rate !== null;

  return (
    <div style={s.row}>
      <section style={s.card} aria-label={t("summary.totalRuns")}>
        <span style={s.label}>{t("summary.totalRuns")}</span>
        <span className="tnum" style={s.value}>
          {formatCount(summary.runs)}
        </span>
        {summary.failed_runs > 0 && (
          <span style={s.sub}>{t("summary.failedExcluded", { count: formatCount(summary.failed_runs) })}</span>
        )}
      </section>

      <section style={s.card} aria-label={t("summary.totalCost")}>
        <span style={s.label}>
          {t("summary.totalCost")} <EstimateLabel basis={costBasis} />
        </span>
        <span className="mono tnum" style={s.value}>
          {formatCost(summary.total_cost_usd)}
        </span>
        {unpriced > 0 && (
          <span style={s.sub}>
            {t("summary.unpriced", { unpriced: formatCount(unpriced), runs: formatCount(summary.runs) })}
          </span>
        )}
      </section>

      <section style={s.card} aria-label={t("summary.avgAcceptRate")}>
        <span style={s.labelRow}>
          <span style={s.label}>{t("summary.avgAcceptRate")}</span>
          {hasRate && <CircularScore score={Math.round(summary.accept_rate! * 100)} size={34} stroke={4} />}
        </span>
        <span className="tnum" style={s.value}>
          {formatPercent(summary.accept_rate)}
        </span>
        <span style={s.sub}>
          {hasRate
            ? t("metrics.ofDecided", { accepted: formatCount(summary.accepted), decided: formatCount(decided) })
            : t("metrics.zeroDecided")}
        </span>
      </section>

      <section style={s.card} aria-label={t("summary.mostActive")}>
        <span style={s.label}>{t("summary.mostActive")}</span>
        {summary.most_active ? (
          <>
            <span style={s.name} title={summary.most_active.agent_name}>
              {summary.most_active.agent_name}
            </span>
            <span style={s.sub}>{t("summary.runsCount", { count: summary.most_active.runs })}</span>
          </>
        ) : (
          <span style={s.value}>—</span>
        )}
      </section>
    </div>
  );
}
