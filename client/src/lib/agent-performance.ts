/* agent-performance — pure window + metric-formatting rules shared by the Agent
   Performance dashboard and the agent Stats tab (SPEC-10). No React, no hooks:
   the URL hook lives in hooks/agent-performance.ts and calls these. */
import type { AgentPerfRow, PerfWindow } from "@devdigest/shared";
import { formatCost } from "./cost";

/** What the selector shows: a rolling preset or a custom local-date range. */
export type UiWindow =
  | { kind: "days"; days: 1 | 30 }
  | { kind: "custom"; start: string; end: string };

export const DEFAULT_WINDOW: UiWindow = { kind: "days", days: 30 };

/** Same ceiling as the server (`PERF_MAX_SPAN_DAYS`), measured as `to − from` in instants. */
const MAX_SPAN_MS = 366 * 86_400_000;
const WINDOW_KEYS = ["days", "from", "to"] as const;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const AGE_MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

export type RangeProblem = "empty" | "reversed" | "future" | "tooLong";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function dateString(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local calendar day of `now` as `YYYY-MM-DD`. */
export function todayLocal(now: Date): string {
  return dateString(now);
}

/** A real calendar date in `YYYY-MM-DD` form, or null. */
function parseDate(s: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return { y, m, d };
}

/** Local midnight of that calendar day, with THAT day's UTC offset (DST ranges get two offsets). */
export function localMidnightIso(date: string): string {
  const p = parseDate(date);
  if (!p) throw new Error(`Invalid date: ${date}`);
  const midnight = new Date(p.y, p.m - 1, p.d);
  const offsetMin = -midnight.getTimezoneOffset();
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  return `${date}T00:00:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `[from, to)` instants of an inclusive local-date range: start midnight → midnight after end. */
export function customRangeInstants(start: string, end: string): { from: string; to: string } {
  const p = parseDate(end);
  if (!p) throw new Error(`Invalid date: ${end}`);
  const next = dateString(new Date(p.y, p.m - 1, p.d + 1));
  return { from: localMidnightIso(start), to: localMidnightIso(next) };
}

/** Why a custom range cannot be applied, or null when it can (AC-34). */
export function validateCustomRange(start: string, end: string, today: string): RangeProblem | null {
  if (!parseDate(start) || !parseDate(end)) return "empty";
  if (start > end) return "reversed";
  if (end > today) return "future";
  const { from, to } = customRangeInstants(start, end);
  if (Date.parse(to) - Date.parse(from) > MAX_SPAN_MS) return "tooLong";
  return null;
}

/** Read the window out of the URL; anything malformed falls back to the default (AC-32). */
export function parseWindowParams(
  params: URLSearchParams,
  today: string,
): { window: UiWindow; repaired: boolean } {
  const hasWindow = WINDOW_KEYS.some((k) => params.has(k));
  if (!hasWindow) return { window: DEFAULT_WINDOW, repaired: false };

  const repair = { window: DEFAULT_WINDOW, repaired: true };
  const days = params.get("days");
  const from = params.get("from");
  const to = params.get("to");

  if (days !== null) {
    if (from !== null || to !== null) return repair;
    if (days === "1") return { window: { kind: "days", days: 1 }, repaired: false };
    if (days === "30") return { window: { kind: "days", days: 30 }, repaired: false };
    return repair;
  }
  if (from === null || to === null) return repair;
  if (validateCustomRange(from, to, today) !== null) return repair;
  return { window: { kind: "custom", start: from, end: to }, repaired: false };
}

/** The window as URL params — also what the dashboard's View link carries. */
export function windowParams(w: UiWindow): [string, string][] {
  return w.kind === "days"
    ? [["days", String(w.days)]]
    : [
        ["from", w.start],
        ["to", w.end],
      ];
}

/** Query string for the API; built with URLSearchParams so a `+` offset goes out as `%2B`. */
export function windowApiQuery(w: UiWindow): string {
  const q = new URLSearchParams();
  if (w.kind === "days") {
    q.set("days", String(w.days));
  } else {
    const { from, to } = customRangeInstants(w.start, w.end);
    q.set("from", from);
    q.set("to", to);
  }
  return q.toString();
}

/** Local `en-US` dates of the window's first and last (inclusive) day — `to` is exclusive. */
export function windowDateLabels(win: PerfWindow): { from: string; to: string } {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return {
    from: fmt(new Date(Date.parse(win.from))),
    to: fmt(new Date(Date.parse(win.to) - 1)),
  };
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Whole percent of a 0..1 rate; "—" when there is no rate. */
export function formatPercent(rate: number | null | undefined): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** "6.2s" (one decimal); "—" when there is no duration. */
export function formatDurationMs(ms: number | null | undefined): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

/** Which `agentPerformance.relative.*` message to use, and its count; null when `iso` does not parse. */
export function relativeAge(
  iso: string,
  now: number,
): { key: "now" | "minutes" | "hours" | "days"; n: number } | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const age = Math.max(0, now - then);
  if (age < AGE_MS.minute) return { key: "now", n: 0 };
  if (age < AGE_MS.hour) return { key: "minutes", n: Math.floor(age / AGE_MS.minute) };
  if (age < AGE_MS.day) return { key: "hours", n: Math.floor(age / AGE_MS.hour) };
  return { key: "days", n: Math.floor(age / AGE_MS.day) };
}

/** The ONE place metric values are turned into strings — dashboard row and Stats tab both use it (AC-62). */
export function metricStrings(row: AgentPerfRow): {
  runs: string;
  avgCost: string;
  avgDuration: string;
  rate: string;
  accepted: string;
  decided: string;
} {
  return {
    runs: formatCount(row.runs),
    avgCost: formatCost(row.avg_cost_usd),
    avgDuration: formatDurationMs(row.avg_duration_ms),
    rate: formatPercent(row.accept_rate),
    accepted: formatCount(row.accepted),
    decided: formatCount(row.accepted + row.dismissed),
  };
}
