/* Dashboard constants. The three metrics (order, colour, i18n keys) and the
   trend axis moved to `@/lib/eval` once the Evals tab drew the same chart; they
   are re-exported here under the same names so this folder's imports stay as
   they were. */

export { METRICS, TREND_Y_MAX, TREND_Y_MIN, TREND_Y_TICKS, type MetricKey } from "@/lib/eval";

/** Runs shown in the table, and points drawn on a card's sparkline / the chart. */
export const MAX_RUN_ROWS = 20;
export const MAX_TREND_POINTS = 20;

/** Compare takes exactly two runs. */
export const COMPARE_COUNT = 2;
