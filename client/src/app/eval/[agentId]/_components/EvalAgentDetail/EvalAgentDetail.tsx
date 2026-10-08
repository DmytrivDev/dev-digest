/* /eval/[agentId] — one agent's regression dashboard (SPEC-04 F).

   Reads one `EvalDashboard` (runs, trend, alert) and lays it out: header,
   regression banner, three metric cards, the trend chart and the recent-runs
   table with run selection. The two selected run ids are the only state kept
   here; everything else is derived from the query during render. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { CompareRunsModal } from "./_components/CompareRunsModal";
import { DetailHeader } from "./_components/DetailHeader";
import { EvalMetricCard } from "./_components/EvalMetricCard";
import { RegressionBanner } from "./_components/RegressionBanner";
import { RunsTable } from "./_components/RunsTable";
import { TrendChart } from "./_components/TrendChart";
import { COMPARE_COUNT, METRICS } from "./constants";
import { metricCardData, toggleSelected } from "./helpers";
import { s } from "./styles";

export function EvalAgentDetail({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalDashboard(agentId);
  const [picked, setPicked] = React.useState<string[]>([]);
  // The pair whose comparison is open, as a key: if the pair changes (a refetch
  // drops a run) the modal closes by itself instead of reopening on a stale flag.
  const [comparedKey, setComparedKey] = React.useState<string | null>(null);

  // A selected run can disappear (a refetch drops it from the last 20): derive
  // the live selection instead of trusting the stored ids.
  const runIds = new Set((data?.runs ?? []).map((r) => r.id));
  const selected = picked.filter((id) => runIds.has(id));
  const pair = selected.length === COMPARE_COUNT ? selected : null;
  const pairKey = pair ? pair.join("|") : null;

  const crumb = [
    { label: t("nav.skillsLab") },
    { label: t("nav.evalDashboard"), href: "/eval" },
    { label: data?.agent.name ?? t("common.loading") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {isLoading && (
          <div style={s.stack}>
            <Link href="/eval" style={s.back}>
              <Icon.ChevronLeft size={14} />
              {t("detail.allAgents")}
            </Link>
            <Skeleton height={32} width={280} />
            <Skeleton height={120} />
            <Skeleton height={220} />
          </div>
        )}
        {isError && (
          <>
            <Link href="/eval" style={s.back}>
              <Icon.ChevronLeft size={14} />
              {t("detail.allAgents")}
            </Link>
            <ErrorState title={t("detail.loadError")} onRetry={() => refetch()} />
          </>
        )}
        {data && (
          <>
            <DetailHeader
              agent={data.agent}
              runCount={data.runs.length}
              caseCount={data.cases_total}
              runningRun={data.runs.find((r) => r.status === "running") ?? null}
            />
            {data.alert && <RegressionBanner alert={data.alert} />}
            <div style={s.cards}>
              {METRICS.map((m) => {
                const card = metricCardData(data.runs, data.trend, m.key);
                return (
                  <EvalMetricCard
                    key={m.key}
                    metric={m.key}
                    label={t(m.cardKey)}
                    color={m.color}
                    value={card.value}
                    delta={card.delta}
                    trend={card.spark}
                  />
                );
              })}
            </div>
            <TrendChart trend={data.trend} />
            <div style={s.runsHead}>
              <SectionLabel icon="History">{t("detail.recentRuns")}</SectionLabel>
              <span style={s.selected}>{t("detail.selected", { count: selected.length })}</span>
              <div style={s.compare}>
                <Button
                  kind="primary"
                  size="sm"
                  icon="GitMerge"
                  disabled={!pair}
                  onClick={() => setComparedKey(pairKey)}
                >
                  {t("detail.compare")}
                </Button>
              </div>
            </div>
            {data.runs.length === 0 ? (
              <EmptyState icon="History" title={t("detail.noRuns")} />
            ) : (
              <RunsTable
                runs={data.runs}
                selected={selected}
                onToggle={(id) => setPicked(toggleSelected(selected, id))}
              />
            )}
          </>
        )}
      </div>
      {pair && comparedKey === pairKey && (
        <CompareRunsModal runAId={pair[0]!} runBId={pair[1]!} onClose={() => setComparedKey(null)} />
      )}
    </AppShell>
  );
}
