/* multi-agent.ts — pure display rules for the Multi-Agent Review screens
   (SPEC-08): the agent palette, duration/cost estimate strings and score colour.
   No React, no I/O. Type-only imports from @devdigest/shared. */
import type { AgentRunEstimate } from "@devdigest/shared";
import { formatCost } from "./cost";

/** Column / tab / card colours; the agent at index i uses PALETTE[i % 5] (AC-29). */
export const PALETTE = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981"] as const;

const EMPTY = "—";

export function agentColor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}

/** `8200` → `"8.2s"`; missing → `"—"`. */
export function formatSeconds(ms: number | null | undefined): string {
  if (ms == null) return EMPTY;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** `8200` → `"~8s"`; missing → `"—"`. */
export function approxSeconds(ms: number | null | undefined): string {
  if (ms == null) return EMPTY;
  return `~${Math.round(ms / 1000)}s`;
}

/** Card estimate `{duration} · {cost}`; each part is `—` when its average is null. */
export function cardEstimate(e: AgentRunEstimate | null | undefined): string {
  return `${formatSeconds(e?.avg_duration_ms)} · ${formatCost(e?.avg_cost_usd)}`;
}

/**
 * Footer estimate for the selected agents: time is the MAX of the non-null
 * average durations (`—` if none); cost is the SUM of the known average costs,
 * with a `+` suffix when any selected agent's cost is unknown (`—` when no cost
 * is known, or nothing is selected) (AC-10).
 */
export function footerEstimate(selected: (AgentRunEstimate | null | undefined)[]): {
  time: string;
  cost: string;
} {
  const durations = selected
    .map((e) => e?.avg_duration_ms)
    .filter((d): d is number => d != null);
  const time = durations.length > 0 ? formatSeconds(Math.max(...durations)) : EMPTY;

  const known = selected
    .map((e) => e?.avg_cost_usd)
    .filter((c): c is number => c != null);
  const cost =
    known.length === 0
      ? EMPTY
      : formatCost(known.reduce((sum, c) => sum + c, 0)) +
        (known.length < selected.length ? "+" : "");
  return { time, cost };
}

/** Score colour: ≥ 70 ok, ≥ 50 warn, otherwise crit; `null` for a missing score. */
export function scoreColor(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 70) return "var(--ok)";
  if (score >= 50) return "var(--warn)";
  return "var(--crit)";
}

/** localStorage key holding the last PR picked on Configure run (AC-45). */
export const LAST_PR_KEY = "dd-multi-agent-pr";

/** The stored PR id, or `""` when none is stored or storage is unavailable. */
export function readLastPr(): string {
  try {
    return localStorage.getItem(LAST_PR_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Remember `id` as the last PR; storage failures are ignored. */
export function writeLastPr(id: string): void {
  try {
    localStorage.setItem(LAST_PR_KEY, id);
  } catch {
    /* private mode / quota: remembering is best-effort */
  }
}

/** localStorage key of the last opened multi-agent results page (AC-46). */
export const LAST_RUN_KEY = "dd-multi-agent-run";

/** The stored run id, or `""` when none is stored or storage is unavailable. */
export function readLastRun(): string {
  try {
    return localStorage.getItem(LAST_RUN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Remember `id` as the last opened run, or forget it with `null`; failures are ignored. */
export function writeLastRun(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_RUN_KEY, id);
    else localStorage.removeItem(LAST_RUN_KEY);
  } catch {
    /* private mode / quota: remembering is best-effort */
  }
}
