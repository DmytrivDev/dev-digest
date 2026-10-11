/* Columns of the CI Runs table. The header cells, every row's cells and the
   grid template are all generated from CI_RUN_COLUMNS, so header and cells can
   never fall out of step (the PR list needs a comment for the same guarantee). */

export const CI_RUN_COLUMNS = [
  { key: "timestamp", width: "112px" },
  { key: "repository", width: "minmax(96px, 1fr)" },
  { key: "pullRequest", width: "minmax(130px, 1.6fr)" },
  { key: "agent", width: "minmax(100px, 1fr)" },
  { key: "source", width: "136px" },
  { key: "duration", width: "48px" },
  { key: "findings", width: "76px" },
  { key: "cost", width: "68px" },
  { key: "verdict", width: "80px" },
  { key: "status", width: "116px" },
  { key: "job", width: "48px" },
] as const;

export type CiRunColumnKey = (typeof CI_RUN_COLUMNS)[number]["key"];

export const CI_RUN_GRID = CI_RUN_COLUMNS.map((c) => c.width).join(" ");

/** Narrowest width at which the 11 tracks stay readable; below it the table scrolls. */
export const CI_RUN_TABLE_MIN_WIDTH = 1140;
