/* AgentTable column config. COLUMN_KEYS (header order and keys) and GRID_TRACKS
   (CSS grid tracks) MUST stay length-aligned — a column added to one and not the
   other misaligns header and cells silently. A test asserts the lengths match. */

export const COLUMN_KEYS = [
  "agent",
  "runs",
  "avgCost",
  "avgDuration",
  "acceptRate",
  "lastRun",
  "view",
] as const;

export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const GRID_TRACKS = ["minmax(160px, 1fr)", "80px", "90px", "100px", "190px", "100px", "70px"] as const;
export const GRID = GRID_TRACKS.join(" ");

/** Fixed tracks + the agent minimum + gaps + padding. Below this width the card
    scrolls horizontally instead of squeezing the Agent column to nothing. */
export const TABLE_MIN_WIDTH = 900;

/** Columns the user can sort by (everything except View). */
export type SortKey = Exclude<ColumnKey, "view">;
export const SORTABLE: readonly SortKey[] = COLUMN_KEYS.filter((k): k is SortKey => k !== "view");

/** First direction on activation: names read A→Z, figures biggest first. */
export const FIRST_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  agent: "asc",
  runs: "desc",
  avgCost: "desc",
  avgDuration: "desc",
  acceptRate: "desc",
  lastRun: "desc",
};

export const DEFAULT_SORT = { key: "acceptRate", dir: "desc" } as const satisfies {
  key: SortKey;
  dir: "asc" | "desc";
};
