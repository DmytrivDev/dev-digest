import type { CSSProperties } from "react";

export const s = {
  card: {
    minWidth: 0,
    background: "var(--bg-surface)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 9,
    padding: "14px 16px",
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  values: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, rowGap: 2, marginTop: 10 } satisfies CSSProperties,
  oldValue: { fontSize: 18, color: "var(--text-muted)" } satisfies CSSProperties,
  arrow: { color: "var(--text-muted)", alignSelf: "center" } satisfies CSSProperties,
  newValue: (color: string): CSSProperties => ({ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color }),
  delta: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    fontSize: 13,
    fontWeight: 600,
    color,
  }),
} as const;
