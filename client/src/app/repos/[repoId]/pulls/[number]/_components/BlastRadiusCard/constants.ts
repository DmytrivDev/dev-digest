import type { IconName } from "@devdigest/ui";
import type { BlastCounts } from "@devdigest/shared";

/** Rows of skeleton shown while the blast query is loading. */
export const SKELETON_ROWS = 3;

/** Graph node geometry, in px. Nodes are sized to their full label (mono
 *  font, ~7.2px per char at 12px) — the canvas scrolls instead of clipping. */
export const GRAPH_CHAR_WIDTH = 7.4;
export const GRAPH_NODE_PAD_X = 14;
export const GRAPH_NODE_MIN_WIDTH = 72;
export const GRAPH_NODE_HEIGHT = 34;
/** A caller node carries a second `file:line` line. */
export const GRAPH_TALL_NODE_HEIGHT = 48;
/** dagre spacing: between nodes in one column, and between columns. */
export const GRAPH_NODE_SEP = 14;
export const GRAPH_RANK_SEP = 96;
export const GRAPH_MARGIN = 20;
/** Visible height of the graph viewport before it scrolls vertically. */
export const GRAPH_VIEWPORT_MAX_HEIGHT = 480;

/** The four stat chips in `BlastSummary`, in display order. */
export const SUMMARY_STATS: { key: keyof BlastCounts; icon: IconName }[] = [
  { key: "symbols", icon: "Code" },
  { key: "callers", icon: "CornerDownRight" },
  { key: "endpoints", icon: "Globe" },
  { key: "crons", icon: "Clock" },
];
