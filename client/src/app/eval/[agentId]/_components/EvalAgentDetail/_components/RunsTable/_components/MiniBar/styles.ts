import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 7 } satisfies CSSProperties,
  track: {
    flex: 1,
    height: 6,
    background: "var(--bg-hover)",
    borderRadius: 3,
    overflow: "hidden",
  } satisfies CSSProperties,
  fill: (value: number, color: string): CSSProperties => ({
    width: `${Math.max(0, Math.min(1, value)) * 100}%`,
    height: "100%",
    background: color,
    borderRadius: 3,
  }),
  value: {
    fontSize: 11,
    color: "var(--text-secondary)",
    width: 34,
    textAlign: "right",
  } satisfies CSSProperties,
} as const;
