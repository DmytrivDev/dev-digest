/* RunsTable — the last runs, newest first (AC-84). The first column is a
   checkbox: only a completed run can be compared (AC-89), and once two are
   picked every other box is disabled (AC-88). The selection itself lives in
   the parent, which also owns the Compare button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { formatWhen } from "@/lib/datetime";
import { MAX_RUN_ROWS, METRICS } from "../../constants";
import { isSelectDisabled } from "../../helpers";
import { MiniBar } from "./_components/MiniBar";
import { RUN_COLUMNS } from "./constants";
import { s } from "./styles";

interface Props {
  runs: readonly EvalSuiteRun[];
  selected: readonly string[];
  onToggle: (runId: string) => void;
}

export function RunsTable({ runs, selected, onToggle }: Props) {
  const t = useTranslations("eval");
  const rows = runs.slice(0, MAX_RUN_ROWS);

  return (
    <div role="table" aria-label={t("detail.recentRuns")} style={s.table}>
      <div role="row" style={s.headRow}>
        {RUN_COLUMNS.map((c) => (
          <div key={c.key} role="columnheader">
            {c.key === "select" ? null : t(`detail.table.${c.key}`)}
          </div>
        ))}
      </div>
      {rows.map((run, i) => (
        <div
          key={run.id}
          role="row"
          data-testid={`run-row-${run.id}`}
          style={s.row(i === rows.length - 1, selected.includes(run.id))}
        >
          <div role="cell">
            <Checkbox
              checked={selected.includes(run.id)}
              disabled={isSelectDisabled(run, selected)}
              ariaLabel={t("detail.table.select", { version: run.agent_version })}
              onChange={() => onToggle(run.id)}
            />
          </div>
          <div role="cell" className="mono" style={s.ranAt}>
            {formatWhen(run.started_at)}
          </div>
          <div role="cell" className="mono" style={s.version}>
            {t("common.version", { version: run.agent_version })}
            {run.status !== "completed" && (
              <Badge color="var(--text-muted)">{t(`common.runStatus.${run.status}`)}</Badge>
            )}
          </div>
          {METRICS.map((m) => (
            <div key={m.key} role="cell">
              <MiniBar value={run[m.key]} color={m.color} />
            </div>
          ))}
          <div role="cell" className="tnum" style={s.pass}>
            {run.status === "completed" ? `${run.cases_passed}/${run.cases_scored}` : "—"}
          </div>
          <div role="cell" className="mono tnum" style={s.cost}>
            {formatCost(run.cost_usd)}
          </div>
        </div>
      ))}
    </div>
  );
}
