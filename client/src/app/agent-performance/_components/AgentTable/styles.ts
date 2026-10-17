import type { CSSProperties } from "react";
import { GRID, TABLE_MIN_WIDTH } from "./constants";

/** Co-located styles for AgentTable. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    marginBottom: 24,
    overflowX: "auto",
  } satisfies CSSProperties,
  header: {
    minWidth: TABLE_MIN_WIDTH,
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 12,
    padding: "10px 18px",
    background: "var(--bg-surface)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    alignItems: "center",
  } satisfies CSSProperties,
  headCell: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 } satisfies CSSProperties,
  /* Avg cost: label on top, the estimate marker on its own line beneath. */
  headCellStacked: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    minWidth: 0,
  } satisfies CSSProperties,
  sortBtn: {
    background: "none",
    borderWidth: 0,
    padding: 0,
    font: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    color: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
  group: {
    minWidth: TABLE_MIN_WIDTH,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  } satisfies CSSProperties,
} as const;
