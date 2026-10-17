import type { CSSProperties } from "react";

/** Co-located styles for SummaryCards. */
export const s = {
  row: { display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" } satisfies CSSProperties,
  card: {
    flex: 1,
    minWidth: 190,
    padding: 16,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  labelRow: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  name: {
    fontSize: 16,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  sub: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
