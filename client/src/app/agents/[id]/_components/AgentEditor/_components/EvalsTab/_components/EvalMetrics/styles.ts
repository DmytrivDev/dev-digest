import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 12 } satisfies CSSProperties,
  card: {
    flex: 1,
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 9,
    padding: 18,
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 } satisfies CSSProperties,
  value: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  delta: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    fontSize: 13,
    fontWeight: 600,
    color,
  }),
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "14px 16px",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "var(--border)",
    borderRadius: 9,
  } satisfies CSSProperties,
} as const;
