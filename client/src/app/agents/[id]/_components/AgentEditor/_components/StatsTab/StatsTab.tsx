/* StatsTab — headline cards (Total runs, Avg cost / run, Avg duration, Accept
   rate) of one agent for the selected period (SPEC-10). The period is the same
   URL-held window as the dashboard; every value comes from `metricStrings`, the
   one formatter the dashboard row also uses, so the two views cannot disagree.
   Server data comes only from the hooks; nothing is copied into state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import type { Agent, AgentPerfRow } from "@devdigest/shared";
import { EstimateLabel } from "@/components/EstimateLabel";
import { PerfWindowSelector } from "@/components/PerfWindowSelector";
import { metricStrings, relativeAge } from "@/lib/agent-performance";
import { useAgentStats, usePerfWindow } from "@/lib/hooks/agent-performance";
import { s } from "./styles";

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.card}>
      <span style={s.label}>{label}</span>
      {children}
    </div>
  );
}

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents.stats");
  const tp = useTranslations("agentPerformance");
  const { window, setWindow, apiQuery } = usePerfWindow();
  const stats = useAgentStats(agent.id, apiQuery);

  const selector = (
    <div style={s.toolbar}>
      <PerfWindowSelector value={window} onChange={setWindow} />
    </div>
  );

  if (stats.isError) {
    return (
      <div style={s.wrap}>
        {selector}
        <ErrorState title={t("loadError")} onRetry={() => void stats.refetch()} />
      </div>
    );
  }

  if (!stats.data) {
    return (
      <div style={s.wrap}>
        {selector}
        <div style={s.row} aria-busy="true">
          <span style={s.srOnly} role="status">
            {t("loading")}
          </span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={s.card}>
              <div style={s.placeholder} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const row: AgentPerfRow = stats.data.agent;

  if (row.runs === 0) {
    const age = row.last_run_at ? relativeAge(row.last_run_at, Date.now()) : null;
    const text =
      row.last_run_at === null
        ? t("neverRun")
        : t("noRunsInPeriod", { when: age ? tp(`relative.${age.key}`, { n: age.n }) : "—" });
    return (
      <div style={s.wrap}>
        {selector}
        <div style={s.empty}>{text}</div>
      </div>
    );
  }

  const m = metricStrings(row);
  const decided = row.accepted + row.dismissed;
  const acceptText =
    decided === 0
      ? `— · ${tp("metrics.zeroDecided")}`
      : [
          `${m.rate} · ${tp("metrics.ofDecided", { accepted: m.accepted, decided: m.decided })}`,
          row.small_sample ? tp("metrics.smallSample", { n: decided }) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div style={s.wrap}>
      {selector}
      <div style={s.row}>
        <Card label={t("totalRuns")}>
          <div className="tnum" style={s.value}>
            {m.runs}
          </div>
        </Card>
        <Card label={t("avgCost")}>
          <div className="tnum" style={s.value}>
            {m.avgCost}
          </div>
          <div style={s.sub}>
            <EstimateLabel basis={stats.data.cost_basis} />
            {row.priced_runs < row.runs && (
              <span>{t("pricedOf", { priced: row.priced_runs, runs: row.runs })}</span>
            )}
          </div>
        </Card>
        <Card label={t("avgDuration")}>
          <div className="tnum" style={s.value}>
            {m.avgDuration}
          </div>
        </Card>
        <Card label={t("acceptRate")}>
          <div className="tnum" style={s.valueText}>
            {acceptText}
          </div>
        </Card>
      </div>
    </div>
  );
}
