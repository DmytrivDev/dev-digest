import type { CSSProperties } from "react";

/** Co-located styles for CostBreakdown. */
export const s = {
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  cardTitle: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
