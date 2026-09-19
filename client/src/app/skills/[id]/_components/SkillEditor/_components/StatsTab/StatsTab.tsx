/* StatsTab — how much this skill is actually used, and what the runs that
   carried it found.

   Every number here is CO-OCCURRENCE: a run carries several skills at once, so
   these are findings from runs whose prompt included this skill, never findings
   this skill caused. The labels and the footnote say so on purpose — a
   precise-looking per-skill score the data cannot support is worse than none. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CircularScore,
  Donut,
  EmptyState,
  ErrorState,
  Icon,
  SectionLabel,
  SeverityBadge,
  Skeleton,
} from "@devdigest/ui";
import type { Severity } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLOR, CATEGORY_FALLBACK, SEVERITY_ORDER } from "./constants";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={86} />
        <Skeleton height={180} />
      </div>
    );
  }
  if (isError || !data) return <ErrorState title={t("stats.loadError")} />;

  // Never linked AND never run: there is nothing to show, and a wall of zeros
  // would read as a verdict on the skill rather than on its usage.
  if (data.used_by.length === 0 && data.runs === 0) {
    return <EmptyState icon="BarChart" title={t("stats.empty.title")} body={t("stats.empty.body")} />;
  }

  const acceptPct = data.accept_rate === null ? null : Math.round(data.accept_rate * 100);
  const segments = Object.entries(data.findings_by_category).map(([label, value]) => ({
    label,
    value,
    color: CATEGORY_COLOR[label] ?? CATEGORY_FALLBACK,
  }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("stats.title")}</h2>
      </div>
      <p style={s.hint}>{t("stats.hint", { days: data.window_days })}</p>

      <div style={s.statRow}>
        <Stat label={t("stats.usedBy")} value={data.used_by.length} />
        <Stat label={t("stats.runs", { days: data.window_days })} value={data.runs} />
        <Stat label={t("stats.findings", { days: data.window_days })} value={data.findings} />
        <Stat
          label={t("stats.acceptRate")}
          // "—" not "0%": nothing triaged is unknown, not rejected.
          value={acceptPct === null ? "—" : acceptPct}
          suffix={acceptPct === null ? undefined : "%"}
          arc={acceptPct}
        />
      </div>

      <div style={s.grid}>
        <Card>
          <SectionLabel icon="Cpu">{t("stats.agentsUsing")}</SectionLabel>
          {data.used_by.length === 0 ? (
            <span style={s.empty}>{t("stats.noAgents")}</span>
          ) : (
            <div style={s.agentList}>
              {data.used_by.map((a) => (
                <div key={a.agent_id} style={s.agentRow(a.agent_enabled)}>
                  <span style={s.agentIcon}>
                    <Icon.Cpu size={12} />
                  </span>
                  <span style={s.agentName}>{a.agent_name}</span>
                  {!a.agent_enabled && <span style={s.empty}>{t("stats.agentDisabled")}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionLabel icon="Tag">{t("stats.byCategory")}</SectionLabel>
          {segments.length === 0 ? (
            <span style={s.empty}>{t("stats.noFindings")}</span>
          ) : (
            <div style={s.donutWrap}>
              <Donut segments={segments} size={120} valuePrefix="" />
            </div>
          )}
        </Card>
      </div>

      {data.findings > 0 && (
        <>
          <div style={{ marginTop: 16 }}>
            <SectionLabel icon="AlertTriangle">{t("stats.bySeverity")}</SectionLabel>
            <div style={s.sevRow}>
              {SEVERITY_ORDER.filter((sev) => data.findings_by_severity[sev]).map((sev) => (
                <SeverityBadge
                  key={sev}
                  severity={sev as Severity}
                  count={data.findings_by_severity[sev]}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <p style={s.footnote}>{t("stats.attributionNote")}</p>
    </div>
  );
}

/** One headline number. `arc` draws the ring the mock puts on the rate card. */
function Stat({
  label,
  value,
  suffix,
  arc,
}: {
  label: string;
  value: number | string;
  suffix?: string | undefined;
  arc?: number | null;
}) {
  return (
    <div style={s.stat}>
      <div style={s.statHead}>
        <span style={s.statLabel}>{label}</span>
        {arc != null && <CircularScore score={arc} size={32} stroke={3.5} />}
      </div>
      <div className="tnum" style={s.statValue}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
        {suffix && <span style={s.statSuffix}>{suffix}</span>}
      </div>
    </div>
  );
}
