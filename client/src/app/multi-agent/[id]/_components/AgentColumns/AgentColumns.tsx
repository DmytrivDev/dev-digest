/* AgentColumns — Columns mode (SPEC-08 AC-28, AC-29): one column per agent in
   column order, equal-width up to five and scrolling beyond. The body depends
   on the agent run's status; View trace shows in every state. Finding titles,
   errors and agent names render as plain text (AC-42). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon, MonoLink, SEV, type Severity } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { agentColor, formatSeconds } from "@/lib/multi-agent";
import { TICK_MS } from "./constants";
import { s } from "./styles";

/** Whole seconds since the run started; ticks while any column is running. */
function useElapsedSeconds(startedAt: string, active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
}

function sevOf(severity: string) {
  return SEV[severity as Severity] ?? SEV.INFO;
}

export function AgentColumns({
  columns,
  startedAt,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  /** The parent run's `ran_at`: the base of the "Running · {s}s" counter. */
  startedAt: string;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const elapsed = useElapsedSeconds(
    startedAt,
    columns.some((c) => c.status === "running"),
  );

  return (
    <div style={s.wrap}>
      <div style={s.grid(columns.length)}>
        {columns.map((col, i) => {
          const color = agentColor(i);
          const done = col.status === "done";
          return (
            <div key={col.run_id} style={s.column}>
              <div style={s.head(color)}>
                <div style={s.headRow}>
                  <div style={s.icon(color)}>
                    <Icon.Cpu size={16} />
                  </div>
                  <div style={s.headText}>
                    <div style={s.name}>{col.agent_name ?? t("results.unknownAgent")}</div>
                    <div className="mono tnum" style={s.stats}>
                      {formatSeconds(col.duration_ms)} · {done ? formatCost(col.cost_usd) : "—"}
                    </div>
                  </div>
                  {done && col.score != null ? (
                    <CircularScore score={col.score} size={32} stroke={3.5} />
                  ) : (
                    <span style={s.scoreDash}>—</span>
                  )}
                </div>
              </div>

              <div style={s.body}>
                {col.status === "running" && (
                  <div style={s.state}>{t("column.running", { seconds: elapsed })}</div>
                )}
                {col.status === "failed" && (
                  <>
                    <div style={s.stateFailed}>{t("column.failed")}</div>
                    {col.error && <div style={s.error}>{col.error}</div>}
                  </>
                )}
                {col.status === "cancelled" && <div style={s.state}>{t("column.cancelled")}</div>}
                {done && col.findings.length === 0 && (
                  <div style={s.state}>{t("column.noFindings")}</div>
                )}
                {done &&
                  col.findings.map((f) => {
                    const sev = sevOf(f.severity);
                    const SevIcon = Icon[sev.icon];
                    return (
                      <div key={f.id} style={s.mini(sev.c)}>
                        <div style={s.miniTitle}>
                          <SevIcon size={12} style={{ color: sev.c, flexShrink: 0 }} />
                          <span style={s.miniText}>{f.title}</span>
                        </div>
                        <div className="mono" style={s.miniLoc}>
                          {f.file}:{f.start_line}
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div style={s.foot}>
                <MonoLink onClick={() => onOpenTrace(col.run_id)}>{t("results.viewTrace")}</MonoLink>
                {done && col.findings.length > 0 && (
                  <span style={s.count}>
                    {t("column.findingsCount", { count: col.findings.length })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
