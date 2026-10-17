import type { CSSProperties } from "react";

/** Co-located styles for RecentRuns. */
export const s = {
  wrap: {
    padding: "0 18px 14px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    animation: "ddpop .15s ease",
  } satisfies CSSProperties,
  title: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  item: { display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
