/* /eval — Eval Dashboard overview (SPEC-04 F). One row per agent of the
   workspace, zero-case agents included; a row opens /eval/<agentId>. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalOverview } from "@/lib/hooks/eval";
import { AgentRow } from "./_components/AgentRow";
import { OVERVIEW_COLUMNS } from "./constants";
import { s } from "./styles";

export function EvalOverview() {
  const t = useTranslations("eval");
  const { data: rows, isLoading, isError, refetch } = useEvalOverview();

  return (
    <AppShell crumb={[{ label: t("nav.skillsLab") }, { label: t("nav.evalDashboard") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("overview.title")}</h1>
          <p style={s.subtitle}>{t("overview.subtitle")}</p>
        </div>

        {isLoading && <Skeleton height={220} />}
        {isError && <ErrorState title={t("overview.loadError")} onRetry={() => refetch()} />}
        {rows && rows.length === 0 && <EmptyState icon="Gauge" title={t("overview.empty")} />}
        {rows && rows.length > 0 && (
          <div role="table" aria-label={t("overview.title")} style={s.table}>
            <div role="row" style={s.headRow}>
              {OVERVIEW_COLUMNS.map((c) => (
                <div key={c.key} role="columnheader">
                  {t(`overview.columns.${c.key}`)}
                </div>
              ))}
            </div>
            {rows.map((row, i) => (
              <AgentRow key={row.agent_id} row={row} last={i === rows.length - 1} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
