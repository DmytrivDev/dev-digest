"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { PerfRecentRun } from "@devdigest/shared";
import { formatDurationMs } from "@/lib/agent-performance";
import { formatCost } from "@/lib/cost";
import { formatWhen } from "@/lib/datetime";
import { s } from "./styles";

/* The row's `recent_runs` from the already-loaded response, newest first; the
   sparkline runs oldest to newest and needs at least two durations. */
export function RecentRuns({ runs }: { runs: readonly PerfRecentRun[] }) {
  const t = useTranslations("agentPerformance.table");

  if (runs.length === 0) {
    return (
      <div style={s.wrap} role="region" aria-label={t("recentRuns")}>
        <span style={s.empty}>{t("noRunsInPeriod")}</span>
      </div>
    );
  }

  const newestFirst = [...runs].sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
  const durations = newestFirst
    .map((r) => r.duration_ms)
    .filter((d): d is number => d !== null)
    .reverse();

  return (
    <div style={s.wrap} role="region" aria-label={t("recentRuns")}>
      <span style={s.title}>{t("recentRuns")}</span>
      <ul style={s.list}>
        {newestFirst.map((r) => (
          <li key={r.run_id} style={s.item}>
            <span>{formatWhen(r.ran_at)}</span>
            <span>{t(`source.${r.source}`)}</span>
            <span className="tnum">{formatDurationMs(r.duration_ms)}</span>
            <span className="mono tnum">{formatCost(r.cost_usd)}</span>
          </li>
        ))}
      </ul>
      {durations.length >= 2 && <Sparkline data={durations} w={160} h={34} />}
    </div>
  );
}
