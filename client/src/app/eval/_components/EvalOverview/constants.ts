/* Columns of the overview table. The header cells and every row's cells are
   both generated from COLUMNS, and GRID is derived from it, so the three can
   never fall out of step (the PR list needs a comment for the same guarantee). */

export const OVERVIEW_COLUMNS = [
  // The fixed tracks plus gaps must fit the ~960px table at the page's max width,
  // or the grid overflows and the last column (and the agent name) get clipped.
  { key: "agent", width: "minmax(200px, 1fr)" },
  { key: "cases", width: "72px" },
  { key: "version", width: "104px" }, // room for "v12" + a "running" badge
  { key: "recall", width: "64px" },
  { key: "precision", width: "72px" },
  { key: "citation", width: "64px" },
  { key: "pass", width: "48px" },
  { key: "cost", width: "64px" },
  { key: "ranAt", width: "150px" },
] as const;

export type OverviewColumnKey = (typeof OVERVIEW_COLUMNS)[number]["key"];

export const OVERVIEW_GRID = OVERVIEW_COLUMNS.map((c) => c.width).join(" ");
