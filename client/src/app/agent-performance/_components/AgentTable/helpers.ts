import type { AgentPerfRow } from "@devdigest/shared";
import type { SortKey } from "./constants";

export type Dir = "asc" | "desc";

const decided = (r: AgentPerfRow) => r.accepted + r.dismissed;

/** 0 = ranked (enough decisions), 1 = small sample, 2 = no decisions (AC-42). */
export function tier(r: AgentPerfRow, minDecisions: number): 0 | 1 | 2 {
  const d = decided(r);
  if (d >= minDecisions) return 0;
  return d >= 1 ? 1 : 2;
}

function value(r: AgentPerfRow, key: SortKey): number | string | null {
  switch (key) {
    case "agent":
      return r.agent_name;
    case "runs":
      return r.runs;
    case "avgCost":
      return r.avg_cost_usd;
    case "avgDuration":
      return r.avg_duration_ms;
    case "acceptRate":
      return r.accept_rate;
    case "lastRun":
      return r.last_run_at === null ? null : Date.parse(r.last_run_at);
  }
}

function cmpValues(a: number | string, b: number | string): number {
  return typeof a === "string" || typeof b === "string"
    ? String(a).localeCompare(String(b), "en")
    : a - b;
}

/** Runs descending, then name ascending — the tie-break of every ordering. */
function tieBreak(a: AgentPerfRow, b: AgentPerfRow): number {
  return b.runs - a.runs || a.agent_name.localeCompare(b.agent_name, "en");
}

/** Client-side sort. Null values stay last in both directions; Accept rate keeps its tiers. */
export function sortRows(
  rows: readonly AgentPerfRow[],
  key: SortKey,
  dir: Dir,
  minDecisions: number,
): AgentPerfRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "acceptRate") {
      const t = tier(a, minDecisions) - tier(b, minDecisions);
      if (t !== 0) return t;
    }
    const va = value(a, key);
    const vb = value(b, key);
    if (va === null && vb !== null) return 1;
    if (va !== null && vb === null) return -1;
    if (va !== null && vb !== null) {
      const c = cmpValues(va, vb);
      if (c !== 0) return sign * c;
    }
    return tieBreak(a, b);
  });
}

/** The order on load: accept rate descending in three tiers (AC-42). */
export function defaultOrder(rows: readonly AgentPerfRow[], minDecisions: number): AgentPerfRow[] {
  return sortRows(rows, "acceptRate", "desc", minDecisions);
}
