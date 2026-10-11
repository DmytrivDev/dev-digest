/* Columns of the CI Runs table. The header cells, every row's cells and the
   grid template are all generated from CI_RUN_COLUMNS, so header and cells can
   never fall out of step (the PR list needs a comment for the same guarantee). */

export const CI_RUN_COLUMNS = [
  { key: "timestamp", width: "150px" },
  { key: "repository", width: "minmax(120px, 0.8fr)" },
  { key: "pullRequest", width: "minmax(160px, 1.4fr)" },
  { key: "agent", width: "140px" },
  { key: "source", width: "148px" },
  { key: "duration", width: "64px" },
  { key: "findings", width: "112px" },
  { key: "cost", width: "72px" },
  { key: "verdict", width: "92px" },
  { key: "status", width: "104px" },
  { key: "job", width: "56px" },
] as const;

export type CiRunColumnKey = (typeof CI_RUN_COLUMNS)[number]["key"];

export const CI_RUN_GRID = CI_RUN_COLUMNS.map((c) => c.width).join(" ");

/** Narrowest width at which the 11 tracks stay readable; below it the table scrolls. */
export const CI_RUN_TABLE_MIN_WIDTH = 1180;
