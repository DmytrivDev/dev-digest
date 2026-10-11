import type { CSSProperties } from "react";

/** Co-located styles for RecentRuns. */
export const s = {
  section: { marginBottom: 24 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 600, marginBottom: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    textDecoration: "none",
    fontSize: 13,
  } satisfies CSSProperties,
  when: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  metric: { color: "var(--text-secondary)", fontSize: 12 } satisfies CSSProperties,
};
