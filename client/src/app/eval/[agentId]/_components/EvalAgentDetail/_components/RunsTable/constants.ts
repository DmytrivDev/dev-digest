/* Columns of the runs table. Header cells and row cells are both generated
   from COLUMNS and GRID is derived from it, so they cannot misalign. The first
   column is the selection checkbox and has no header text. */

export const RUN_COLUMNS = [
  { key: "select", width: "28px" },
  { key: "ranAt", width: "170px" },
  { key: "version", width: "96px" },
  { key: "recall", width: "1fr" },
  { key: "precision", width: "1fr" },
  { key: "citation", width: "1fr" },
  { key: "pass", width: "80px" },
  { key: "cost", width: "80px" },
] as const;

export const RUN_GRID = RUN_COLUMNS.map((c) => c.width).join(" ");
