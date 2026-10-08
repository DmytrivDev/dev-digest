/* RunHistory — the agent's last runs, newest first (AC-33). Columns: ran at ·
   version · recall · precision · citation · pass · cost · status. The section
   links to the agent's full dashboard. With no run yet only the heading and the
   link show — the "No runs yet" text already sits in the metrics area. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { formatWhen } from "@/lib/datetime";
import { formatMetric } from "@/lib/eval";
import { RUN_HISTORY_LIMIT } from "../../constants";
import { newestFirst } from "../../helpers";
import { s, STATUS_COLOR } from "./styles";

const COLUMNS = ["ranAt", "version", "recall", "precision", "citation", "pass", "cost", "status"] as const;

export function RunHistory({ agentId, runs }: { agentId: string; runs: readonly EvalSuiteRun[] }) {
  const t = useTranslations("eval");
  const rows = newestFirst(runs).slice(0, RUN_HISTORY_LIMIT);
  return (
    <div>
      <SectionLabel
        right={
          <Link href={`/eval/${agentId}`} style={s.link}>
            {t("evalsTab.runHistory.link")}
          </Link>
        }
      >
        {t("evalsTab.runHistory.title")}
      </SectionLabel>
      {rows.length > 0 && (
        <table style={s.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} style={s.th}>
                  {t(`evalsTab.runHistory.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => (
              <tr key={run.id}>
                <td style={s.td}>{formatWhen(run.started_at)}</td>
                <td style={s.td} className="mono">
                  {t("common.version", { version: run.agent_version })}
                </td>
                <td style={s.td} className="tnum">{formatMetric(run.recall)}</td>
                <td style={s.td} className="tnum">{formatMetric(run.precision)}</td>
                <td style={s.td} className="tnum">{formatMetric(run.citation_accuracy)}</td>
                <td style={s.td} className="tnum">
                  {run.cases_passed}/{run.cases_scored}
                </td>
                <td style={s.td} className="tnum">{formatCost(run.cost_usd)}</td>
                <td style={s.td}>
                  <Badge
                    color={STATUS_COLOR[run.status].color}
                    bg={STATUS_COLOR[run.status].bg}
                    dot
                  >
                    {t(`common.runStatus.${run.status}`)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
