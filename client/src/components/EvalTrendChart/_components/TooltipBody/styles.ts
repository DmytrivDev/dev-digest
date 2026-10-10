import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 } satisfies CSSProperties,
  when: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  version: { fontFamily: "var(--font-mono)", color: "var(--text-muted)" } satisfies CSSProperties,
  cost: { color: "var(--text-muted)", marginBottom: 4 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
} as const;
