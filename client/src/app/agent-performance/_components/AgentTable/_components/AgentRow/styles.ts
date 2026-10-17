import type { CSSProperties } from "react";
import { GRID } from "../../constants";

/** Co-located styles for AgentRow. */
export const s = {
  row: {
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 12,
    padding: "12px 18px",
    alignItems: "center",
    fontSize: 13,
  } satisfies CSSProperties,
  nameCell: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  chevron: {
    background: "none",
    borderWidth: 0,
    padding: 2,
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 13.5,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  muted: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  rateCell: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  rate: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  small: { fontSize: 11, color: "var(--warn)" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "none", fontSize: 13 } satisfies CSSProperties,
} as const;
