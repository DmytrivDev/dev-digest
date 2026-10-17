/* /agent-performance — which agents earn their keep (SPEC-10). Exactly one body
   renders under the header: placeholders, the error, an empty state, or the data. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { AgentPerf } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { PerfWindowSelector } from "@/components/PerfWindowSelector";
import { windowDateLabels } from "@/lib/agent-performance";
import { useAgentPerformance, usePerfWindow } from "@/lib/hooks/agent-performance";
import { AgentTable } from "../AgentTable";
import { CostBreakdown } from "../CostBreakdown";
import { SummaryCards } from "../SummaryCards";
import { s } from "./styles";

function Placeholders({ label }: { label: string }) {
  return (
    <div role="region" aria-busy="true" aria-label={label} style={s.placeholders}>
      <div style={s.placeholderCards}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={96} style={s.placeholderCard} />
        ))}
      </div>
      <Skeleton height={240} />
      <div style={s.placeholderCards}>
        <Skeleton height={170} style={s.placeholderCard} />
        <Skeleton height={170} style={s.placeholderCard} />
      </div>
    </div>
  );
}

function Body({ data, windowParams }: { data: AgentPerf; windowParams: [string, string][] }) {
  const t = useTranslations("agentPerformance.states");

  if (data.agents.length === 0) {
    return (
      <EmptyState
        icon="Activity"
        title={t("noAgents.title")}
        body={
          <>
            {t("noAgents.body")}{" "}
            <Link href="/agents" style={s.link}>
              {t("noAgents.link")}
            </Link>
          </>
        }
      />
    );
  }
  if (data.summary.runs === 0) {
    const { from, to } = windowDateLabels(data.window);
    return <EmptyState icon="Activity" title={t("noRuns.title")} body={t("noRuns.body", { from, to })} />;
  }
  return (
    <>
      <SummaryCards summary={data.summary} costBasis={data.cost_basis} />
      <AgentTable
        agents={data.agents}
        minDecisions={data.min_decisions}
        costBasis={data.cost_basis}
        windowParams={windowParams}
      />
      <CostBreakdown
        byAgent={data.cost_by_agent}
        byModel={data.cost_by_model}
        totalCostUsd={data.summary.total_cost_usd}
        runs={data.summary.runs}
        costBasis={data.cost_basis}
      />
    </>
  );
}

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const { window, setWindow, apiQuery, params } = usePerfWindow();
  const q = useAgentPerformance(apiQuery);
  const crumb = [{ label: t("title") }];

  let body: React.ReactNode;
  if (q.data) {
    body = <Body data={q.data} windowParams={params} />;
  } else if (q.isError && !q.isFetching) {
    body = <ErrorState title={t("states.loadError")} onRetry={() => q.refetch()} />;
  } else {
    body = <Placeholders label={t("states.loading")} />;
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <div style={s.selector}>
            <PerfWindowSelector value={window} onChange={setWindow} />
          </div>
        </div>
        {body}
      </div>
    </AppShell>
  );
}
