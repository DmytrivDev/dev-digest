import type { CSSProperties } from "react";

export const s = {
  top: { display: "flex", alignItems: "center", gap: 16, marginBottom: 12 } satisfies CSSProperties,
  legend: { marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5 } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({
    width: 10,
    height: 2,
    background: color,
    borderRadius: 2,
  }),
} as const;
