/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score.
   The PR Brief reuses it (SPEC-03, DR-16): `verdict` may be null (no review yet — no
   icon, label, badge or ring), and `cost`, `actions` and `children` add the cost row
   under the score, the refresh control and the muted lines under the summary. The Agent
   runs accordion passes none of them and renders exactly as before. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { VERDICT_META } from "./constants";
import { s } from "./styles";

export function VerdictBanner({
  verdict,
  summary,
  score,
  findingsCount = 0,
  blockers = 0,
  agentName,
  cost,
  actions,
  children,
}: {
  verdict: Verdict | null;
  summary: string | null;
  score: number | null;
  findingsCount?: number;
  blockers?: number;
  agentName?: string | null;
  /** Generation cost under the score column; `title` is the tooltip (the model). */
  cost?: { text: string; title: string };
  /** Controls at the right of the title row (e.g. the refresh icon). */
  actions?: React.ReactNode;
  /** Muted lines under the summary. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const m = verdict ? (VERDICT_META[verdict] ?? VERDICT_META.comment) : null;
  const VIcon = m ? Icon[m.icon] : null;
  const hasTitleRow = !!m || !!actions;
  return (
    <div style={s.wrap}>
      {m && VIcon && (
        <div style={s.iconBox(m.bg, m.c)}>
          <VIcon size={22} />
        </div>
      )}
      <div style={s.main}>
        {hasTitleRow && (
          <div style={s.titleRow}>
            {m && (
              <>
                <span style={s.label(m.c)}>{t(`verdict.${m.labelKey}`)}</span>
                <Badge color="var(--text-secondary)">
                  {t("verdict.findingsCount", { count: findingsCount })}
                  {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
                </Badge>
                {agentName && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
                    {agentName}
                  </Badge>
                )}
              </>
            )}
            {actions && <div style={s.actions}>{actions}</div>}
          </div>
        )}
        {summary && <p style={m || actions ? s.summary : s.summaryFirst}>{summary}</p>}
        {children}
      </div>
      {(score != null || cost) && (
        <div style={s.scoreCol}>
          {score != null && (
            <>
              <CircularScore score={score} size={52} stroke={5} />
              <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
            </>
          )}
          {cost && (
            <div style={s.costRow(score != null)}>
              <Icon.DollarSign size={11} style={{ color: "var(--text-muted)" }} />
              <span className="mono" title={cost.title} style={s.cost}>
                {cost.text}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
