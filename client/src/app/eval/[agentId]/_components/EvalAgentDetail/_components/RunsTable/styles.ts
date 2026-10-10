import type { CSSProperties } from "react";
import { RUN_GRID } from "./constants";

export const s = {
  table: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: RUN_GRID,
    gap: 12,
    padding: "9px 16px",
    background: "var(--bg-surface)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: (last: boolean, selected: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: RUN_GRID,
    gap: 12,
    padding: "10px 16px",
    alignItems: "center",
    fontSize: 12.5,
    background: selected ? "var(--bg-hover)" : "transparent",
    borderBottomWidth: last ? 0 : 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  }),
  ranAt: { color: "var(--text-secondary)", fontSize: 11.5 } satisfies CSSProperties,
  version: { display: "flex", alignItems: "center", gap: 6, color: "var(--accent-text)" } satisfies CSSProperties,
  pass: { fontWeight: 600 } satisfies CSSProperties,
  cost: { color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
