import type { EvalCompare } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { deltaPoints, formatMetric } from "@/lib/eval";

export type Direction = "up" | "down" | "flat";

export function directionOf(delta: number | null): Direction | null {
  if (delta == null) return null;
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

/** Tokens: a metric going up is good, down is bad, no change is quiet. */
export function metricDeltaColor(direction: Direction | null): string {
  if (direction === "up") return "var(--ok)";
  if (direction === "down") return "var(--crit)";
  return "var(--text-muted)";
}

export interface PercentCard {
  oldText: string;
  newText: string;
  direction: Direction | null;
  /** Whole points, always positive — the arrow carries the sign. */
  points: number;
}

/** old % → new % and the change in whole points, from two 0..1 values (either may be null → "n/a"). */
export function percentCard(oldV: number | null, newV: number | null): PercentCard {
  const delta = deltaPoints(newV, oldV);
  return {
    oldText: formatMetric(oldV),
    newText: formatMetric(newV),
    direction: directionOf(delta),
    points: Math.abs(delta ?? 0),
  };
}

export interface CostCard {
  oldText: string;
  newText: string;
  direction: Direction | null;
  /** The change in dollars, formatted without a sign. */
  deltaText: string;
}

/** old $ → new $ and the dollar change. Cost is run-level, not recomputed over the common cases. */
export function costCard(compare: Pick<EvalCompare, "old" | "new" | "deltas">): CostCard {
  const delta = compare.deltas.cost_usd;
  return {
    oldText: formatCost(compare.old.cost_usd),
    newText: formatCost(compare.new.cost_usd),
    direction: directionOf(delta),
    deltaText: formatCost(delta == null ? null : Math.abs(delta)),
  };
}

/** A config value as shown in "field: old → new"; an empty one (no skills) is "—". */
export function configValue(v: string): string {
  return v === "" ? "—" : v;
}
