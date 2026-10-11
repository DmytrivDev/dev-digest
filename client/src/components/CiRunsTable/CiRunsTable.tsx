/* CiRunsTable — one row per CI run (AC-37). Everything that comes from GitHub
   (the PR title above all) is rendered as a React text child, never as HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { CI_RUN_COLUMNS } from "./constants";
import { findingCounts, formatDuration, formatRunTime, isHttpUrl, runStatusTone, verdictTone } from "./helpers";
import { s } from "./styles";

type Translate = ReturnType<typeof useTranslations>;

function CiRunRow({ run, last, t }: { run: CiRun; last: boolean; t: Translate }) {
  const counts = findingCounts(run);
  return (
    <div role="row" style={s.row(last)}>
      <span role="cell" className="mono" style={{ ...s.mono, ...s.ellipsis }}>
        {formatRunTime(run.ran_at)}
      </span>
      <span role="cell" className="mono" style={{ ...s.mono, ...s.ellipsis }}>
        {run.repo}
      </span>
      <div role="cell" style={s.prCell}>
        {run.pr_number != null ? (
          <>
            <span className="mono" style={s.prNumber}>
              #{run.pr_number}
            </span>
            {run.pr_title && <span style={s.prTitle}>{run.pr_title}</span>}
          </>
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <span role="cell" style={s.agent}>
        <Icon.Cpu size={13} style={s.agentIcon} />
        <span style={s.ellipsis}>{run.agent_name}</span>
      </span>
      <span role="cell">
        <Badge color="var(--text-secondary)" icon="Workflow">
          {t("runs.source")}
        </Badge>
      </span>
      <span role="cell" className="tnum" style={s.duration}>
        {formatDuration(run.duration_ms)}
      </span>
      <div role="cell">
        {counts.length === 0 ? (
          <span style={s.muted}>—</span>
        ) : (
          <div style={s.counts}>
            {counts.map(({ severity, color, icon, count }) => {
              const I = Icon[icon];
              return (
                <span key={severity} style={s.count(color)}>
                  <I size={12} />
                  <span className="tnum">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <span role="cell" className="mono tnum" style={s.cost}>
        {formatCost(run.cost_usd)}
      </span>
      <span role="cell">
        {run.verdict ? (
          <Badge {...verdictTone(run.verdict)}>{t(`runs.verdict.${run.verdict}`)}</Badge>
        ) : (
          <span style={s.muted}>—</span>
        )}
      </span>
      <span role="cell" title={run.reason ?? undefined}>
        <Badge {...runStatusTone(run.status)} dot>
          {t(`runs.status.${run.status}`)}
        </Badge>
      </span>
      <span role="cell">
        {isHttpUrl(run.job_url) ? (
          <MonoLink href={run.job_url}>{t("runs.jobLink")}</MonoLink>
        ) : (
          <span style={s.muted}>—</span>
        )}
      </span>
    </div>
  );
}

export function CiRunsTable({ runs }: { runs: CiRun[] }) {
  const t = useTranslations("ci");
  return (
    <div style={s.scroller}>
      <div role="table" aria-label={t("runs.title")} style={s.table}>
        <div role="row" style={s.headRow}>
          {CI_RUN_COLUMNS.map((c) => (
            <div key={c.key} role="columnheader">
              {t(`runs.columns.${c.key}`)}
            </div>
          ))}
        </div>
        {runs.map((run, i) => (
          <CiRunRow key={run.id} run={run} last={i === runs.length - 1} t={t} />
        ))}
      </div>
    </div>
  );
}
