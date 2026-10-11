import type { CSSProperties } from "react";
import { MAX_EQUAL_COLUMNS, SCROLL_COLUMN_WIDTH } from "./constants";

/** Co-located styles for AgentColumns. */
export const s = {
  wrap: { padding: "20px 28px 24px" } satisfies CSSProperties,
  grid: (n: number): CSSProperties =>
    n <= MAX_EQUAL_COLUMNS
      ? { display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 12 }
      : {
          display: "grid",
          gridTemplateColumns: `repeat(${n}, ${SCROLL_COLUMN_WIDTH}px)`,
          gap: 12,
          overflowX: "auto",
        },
  column: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  } satisfies CSSProperties,
  head: (color: string): CSSProperties => ({
    padding: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: color,
  }),
  headRow: { display: "flex", alignItems: "center", gap: 9 } satisfies CSSProperties,
  icon: (color: string): CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: color + "1f",
    color,
    flexShrink: 0,
  }),
  headText: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  stats: { fontSize: 10.5, color: "var(--text-muted)" } satisfies CSSProperties,
  scoreDash: { fontSize: 14, color: "var(--text-muted)", width: 32, textAlign: "center" } satisfies CSSProperties,
  body: {
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    flex: 1,
  } satisfies CSSProperties,
  state: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  stateFailed: { fontSize: 13, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  error: {
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    wordBreak: "break-word",
  } satisfies CSSProperties,
  mini: (color: string): CSSProperties => ({
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: color,
  }),
  miniTitle: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  miniText: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 } satisfies CSSProperties,
  miniLoc: { fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  foot: {
    padding: "9px 12px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    background: "var(--bg-surface)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  count: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
};
