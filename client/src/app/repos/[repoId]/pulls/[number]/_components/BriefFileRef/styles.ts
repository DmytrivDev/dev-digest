import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "inline-flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: 8,
  } satisfies CSSProperties,
  ref: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    cursor: "pointer",
    color: "var(--accent-text)",
    textAlign: "left",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  notInDiff: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
