import type { CSSProperties } from "react";

export const s = {
  quote: {
    fontSize: 14,
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-primary)",
    marginBottom: 14,
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  columnHeader: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color,
    marginBottom: 8,
  }),
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  item: (muted: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 12.5,
    color: muted ? "var(--text-muted)" : "var(--text-secondary)",
    lineHeight: 1.45,
  }),
  bullet: (color: string): CSSProperties => ({
    color,
    lineHeight: 1.45,
  }),
} as const;
