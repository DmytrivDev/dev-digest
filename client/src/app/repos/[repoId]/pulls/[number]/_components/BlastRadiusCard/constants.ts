import type { IconName } from "@devdigest/ui";
import type { BlastCounts } from "@devdigest/shared";

/** Rows of skeleton shown while the blast query is loading. */
export const SKELETON_ROWS = 3;

/** Callers rendered before a group collapses into "+N more" (W7 graph only —
 *  the tree renders every caller the facade already capped). */
export const GRAPH_MAX_CALLERS = 8;

/** The graph's fixed SVG canvas size. */
export const GRAPH_WIDTH = 640;
export const GRAPH_HEIGHT = 280;

/** The four stat chips in `BlastSummary`, in display order. */
export const SUMMARY_STATS: { key: keyof BlastCounts; icon: IconName }[] = [
  { key: "symbols", icon: "Code" },
  { key: "callers", icon: "CornerDownRight" },
  { key: "endpoints", icon: "Globe" },
  { key: "crons", icon: "Clock" },
];
