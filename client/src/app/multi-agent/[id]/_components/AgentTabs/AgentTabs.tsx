/* AgentTabs — Tabs mode (SPEC-08 AC-29..AC-32): one tab per agent with its score,
   a summary card for the selected agent, and that agent's findings through the
   existing FindingCard. Accept/Dismiss act on one finding id; Learn is a
   disabled placeholder that never calls the API. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, Icon, MonoLink } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { FindingCard } from "@/components/FindingCard";
import { formatCost } from "@/lib/cost";
import { useFindingAction } from "@/lib/hooks/reviews";
import { agentColor, formatSeconds, scoreColor } from "@/lib/multi-agent";
import { s } from "./styles";

export function AgentTabs({
  columns,
  prId,
  onOpenTrace,
  onChanged,
}: {
  columns: AgentColumn[];
  prId: string;
  onOpenTrace: (runId: string) => void;
  /** Re-read the run after a triage action (polling may have stopped). */
  onChanged: () => void;
}) {
  const t = useTranslations("multiAgent");
  const action = useFindingAction();
  const [sel, setSel] = React.useState(0);
  const idx = Math.min(sel, columns.length - 1);
  const col = columns[idx];
  if (!col) return null;
  const color = agentColor(idx);
  const done = col.status === "done";

  return (
    <div style={s.wrap}>
      <div role="tablist" aria-label={t("tabs.listLabel")} style={s.tabList}>
        {columns.map((c, i) => {
          const on = i === idx;
          const sc = scoreColor(c.status === "done" ? c.score : null);
          return (
            <button
              key={c.run_id}
              type="button"
              role="tab"
              id={`ma-tab-${c.run_id}`}
              aria-selected={on}
              aria-controls="ma-tabpanel"
              onClick={() => setSel(i)}
              style={s.tab(on, agentColor(i))}
            >
              <Icon.Cpu size={15} style={{ color: on ? agentColor(i) : "var(--text-muted)" }} />
              <span style={s.tabName(on)}>{c.agent_name ?? t("results.unknownAgent")}</span>
              <span className="tnum" style={s.tabScore(sc)}>
                {sc && c.score != null ? c.score : "—"}
              </span>
            </button>
          );
        })}
      </div>

      <div id="ma-tabpanel" role="tabpanel" aria-labelledby={`ma-tab-${col.run_id}`} style={s.panel}>
        <div style={s.summary(color)}>
          {done && col.score != null ? (
            <CircularScore score={col.score} size={44} />
          ) : (
            <span style={s.scoreDash}>—</span>
          )}
          <div>
            <div style={s.agentName(color)}>{col.agent_name ?? t("results.unknownAgent")}</div>
            <p style={s.summaryText}>{col.summary || t("tabs.noSummary")}</p>
          </div>
          <div style={s.side}>
            <MonoLink onClick={() => onOpenTrace(col.run_id)}>{t("results.viewTrace")}</MonoLink>
            <span className="mono tnum" style={s.stats}>
              {formatSeconds(col.duration_ms)} · {done ? formatCost(col.cost_usd) : "—"}
            </span>
          </div>
        </div>

        {col.status === "running" && <div style={s.note}>{t("tabs.runningBody")}</div>}
        {col.status === "cancelled" && <div style={s.note}>{t("tabs.cancelledBody")}</div>}
        {col.status === "failed" && (
          <div style={s.noteFailed}>{t("tabs.failedBody", { error: col.error ?? "—" })}</div>
        )}
        {done && col.findings.length === 0 && <div style={s.note}>{t("tabs.noFindings")}</div>}
        {done && col.findings.length > 0 && (
          <div style={s.list}>
            {col.findings.map((f, i) => (
              <div key={f.id} style={s.item}>
                <FindingCard
                  f={f}
                  defaultExpanded={i === 0}
                  agentId={col.agent_id}
                  prId={prId}
                  pending={action.isPending}
                  onAction={(act) =>
                    action.mutate(
                      { findingId: f.id, action: act, prId },
                      { onSuccess: () => onChanged() },
                    )
                  }
                />
                <span style={s.learn}>
                  <Button kind="ghost" size="sm" disabled title={t("tabs.learnTooltip")}>
                    {t("tabs.learn")}
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
