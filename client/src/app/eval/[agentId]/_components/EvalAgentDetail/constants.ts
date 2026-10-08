/* The three scored metrics, in the order the dashboard shows them, with the
   colour each keeps on the cards, the trend lines and the mini bars (mock:
   screen_skills.jsx:296-323). Tokens only — no raw colours (NFR-7). */

export const METRICS = [
  {
    key: "recall",
    color: "var(--accent)",
    cardKey: "common.metrics.recall",
    compareKey: "common.metrics.recall",
    legendKey: "detail.legend.recall",
  },
  {
    key: "precision",
    color: "var(--ok)",
    cardKey: "common.metrics.precision",
    compareKey: "common.metrics.precision",
    legendKey: "detail.legend.precision",
  },
  {
    key: "citation_accuracy",
    color: "var(--warn)",
    cardKey: "common.metrics.citationAccuracy",
    compareKey: "common.metrics.citation",
    legendKey: "detail.legend.citation",
  },
] as const;

export type MetricKey = (typeof METRICS)[number]["key"];

/** Runs shown in the table, and points drawn on a card's sparkline / the chart. */
export const MAX_RUN_ROWS = 20;
export const MAX_TREND_POINTS = 20;

/** Compare takes exactly two runs. */
export const COMPARE_COUNT = 2;

/** The metrics are ratios: the trend chart spans the whole of 0..1 (AC-83). */
export const TREND_Y_MIN = 0;
export const TREND_Y_MAX = 1;
/** Even 0.2 steps so every label sits on its own grid line (no 0.25 → "0.3"). */
export const TREND_Y_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
