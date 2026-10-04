import type { CSSProperties } from "react";

export const s = {
  card: (color: string): CSSProperties => ({
    margin: "6px 12px 8px 44px",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${color}`,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  }),
  head: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  label: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color,
  }),
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  text: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  source: {
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
