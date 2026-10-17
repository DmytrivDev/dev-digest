"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { AgentPerfRow, CostBasis } from "@devdigest/shared";
import { EstimateLabel } from "@/components/EstimateLabel";
import { AgentRow } from "./_components/AgentRow";
import { COLUMN_KEYS, DEFAULT_SORT, FIRST_DIRECTION, SORTABLE, type SortKey } from "./constants";
import { sortRows, type Dir } from "./helpers";
import { s } from "./styles";

/* Per-agent table. Sorting and the single expanded row are local state — both work
   on the already-loaded response, so neither sends a request (AC-43, AC-44). */
export function AgentTable({
  agents,
  minDecisions,
  costBasis,
  windowParams,
}: {
  agents: readonly AgentPerfRow[];
  minDecisions: number;
  costBasis: CostBasis;
  windowParams: readonly (readonly [string, string])[];
}) {
  const t = useTranslations("agentPerformance.table");
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>(DEFAULT_SORT);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(
    () => sortRows(agents, sort.key, sort.dir, minDecisions),
    [agents, sort, minDecisions],
  );

  const activate = (key: SortKey) =>
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: FIRST_DIRECTION[key] },
    );

  const now = Date.now();

  return (
    <div style={s.card} role="table" aria-label={t("agent")}>
      <div style={s.header} role="row">
        {COLUMN_KEYS.map((key) => {
          const sortable = (SORTABLE as readonly string[]).includes(key);
          const active = sortable && sort.key === key;
          const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
          return (
            <div
              key={key}
              role="columnheader"
              style={key === "avgCost" ? s.headCellStacked : s.headCell}
              aria-sort={sortable ? ariaSort : undefined}
            >
              {sortable ? (
                <button type="button" style={s.sortBtn} onClick={() => activate(key as SortKey)}>
                  {t(key)}
                  {active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ) : (
                <span>{t(key)}</span>
              )}
              {key === "avgCost" && <EstimateLabel basis={costBasis} />}
            </div>
          );
        })}
      </div>
      {rows.map((row) => (
        <div key={row.agent_id} role="rowgroup" style={s.group}>
          <AgentRow
            row={row}
            now={now}
            expanded={expandedId === row.agent_id}
            onToggle={() => setExpandedId((cur) => (cur === row.agent_id ? null : row.agent_id))}
            windowParams={windowParams}
          />
        </div>
      ))}
    </div>
  );
}
