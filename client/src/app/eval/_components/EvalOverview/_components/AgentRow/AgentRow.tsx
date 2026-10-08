/* AgentRow — one row of the eval overview: the agent, its case count and its
   latest run. The whole row opens the agent's dashboard detail; the agent name
   is the native button that makes that reachable from the keyboard (Enter and
   Space click it, the click bubbles to the row), so there is exactly one
   navigation handler. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalOverviewRow } from "@devdigest/shared";
import { NO_VALUE, runCells } from "../../helpers";
import { s } from "../../styles";

export function AgentRow({ row, last }: { row: EvalOverviewRow; last: boolean }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const [hovered, setHovered] = React.useState(false);
  const run = row.latest_run;
  const cells = run ? runCells(run) : null;

  return (
    <div
      role="row"
      data-testid={`eval-row-${row.agent_id}`}
      style={s.row(last, hovered)}
      onClick={() => router.push(`/eval/${row.agent_id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div role="cell" style={s.agentCell}>
        <button type="button" style={s.agentButton}>
          {row.agent_name}
        </button>
        <Badge color="var(--text-secondary)" mono>
          {row.model}
        </Badge>
      </div>

      {row.cases_total === 0 ? (
        <div role="cell" style={s.noCases}>
          <span style={s.muted}>{t("overview.noCases")}</span>
          <Link
            href={`/agents/${row.agent_id}?tab=evals`}
            style={s.noCasesLink}
            onClick={(e) => e.stopPropagation()}
          >
            {t("overview.configure")}
          </Link>
        </div>
      ) : (
        <>
          <div role="cell" className="tnum" style={s.muted}>
            {t("overview.casesCount", { count: row.cases_total })}
          </div>
          <div role="cell" className="mono" style={s.version}>
            {run ? t("common.version", { version: run.agent_version }) : NO_VALUE}
            {run && run.status !== "completed" && (
              <Badge color="var(--text-muted)">{t(`common.runStatus.${run.status}`)}</Badge>
            )}
          </div>
          <div role="cell" className="tnum">{cells?.recall ?? NO_VALUE}</div>
          <div role="cell" className="tnum">{cells?.precision ?? NO_VALUE}</div>
          <div role="cell" className="tnum">{cells?.citation ?? NO_VALUE}</div>
          <div role="cell" className="tnum" style={s.pass}>{cells?.pass ?? NO_VALUE}</div>
          <div role="cell" className="mono tnum" style={s.muted}>{cells?.cost ?? NO_VALUE}</div>
          <div role="cell" className="mono" style={s.ranAt}>{cells?.ranAt ?? NO_VALUE}</div>
        </>
      )}
    </div>
  );
}
