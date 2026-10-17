"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentPerfRow } from "@devdigest/shared";
import { metricStrings, relativeAge } from "@/lib/agent-performance";
import { formatWhen } from "@/lib/datetime";
import { RecentRuns } from "../RecentRuns";
import { s } from "./styles";

/* Values come from metricStrings — the same function the Stats tab renders from (AC-62). */
export function AgentRow({
  row,
  now,
  expanded,
  onToggle,
  windowParams,
}: {
  row: AgentPerfRow;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  windowParams: readonly (readonly [string, string])[];
}) {
  const t = useTranslations("agentPerformance");
  const m = metricStrings(row);
  const hasRate = row.accept_rate !== null;
  const age = row.last_run_at === null ? null : relativeAge(row.last_run_at, now);
  const query = new URLSearchParams([["tab", "stats"], ...windowParams.map(([k, v]) => [k, v] as [string, string])]);
  const href = `/agents/${row.agent_id}?${query.toString()}`;
  const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <>
      <div style={s.row} role="row">
        <div style={s.nameCell} role="cell">
          <button
            type="button"
            style={s.chevron}
            aria-expanded={expanded}
            aria-label={t("table.expand", { name: row.agent_name })}
            onClick={onToggle}
          >
            <Chevron size={14} />
          </button>
          <span style={s.name} title={row.agent_name}>
            {row.agent_name}
          </span>
        </div>
        <span className="tnum" role="cell">
          {m.runs}
        </span>
        <span className="mono tnum" role="cell">
          {m.avgCost}
        </span>
        <span className="tnum" role="cell">
          {m.avgDuration}
        </span>
        <div style={s.rateCell} role="cell">
          <span className="tnum" style={s.rate}>
            {hasRate ? `${m.rate} · ${m.accepted}/${m.decided}` : m.rate}
          </span>
          {!hasRate && <span style={s.muted}>{t("metrics.zeroDecided")}</span>}
          {row.small_sample && <span style={s.small}>{t("metrics.smallSample", { n: m.decided })}</span>}
        </div>
        <span
          style={s.muted}
          role="cell"
          title={row.last_run_at === null ? undefined : formatWhen(row.last_run_at)}
        >
          {age === null ? t("table.never") : t(`relative.${age.key}`, { n: age.n })}
        </span>
        <div role="cell">
          <Link href={href} style={s.link} aria-label={t("table.viewLabel", { name: row.agent_name })}>
            {t("table.view")}
          </Link>
        </div>
      </div>
      {expanded && <RecentRuns runs={row.recent_runs} />}
    </>
  );
}
