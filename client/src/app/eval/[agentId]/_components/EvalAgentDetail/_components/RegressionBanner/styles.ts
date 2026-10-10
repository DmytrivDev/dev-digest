import type { CSSProperties } from "react";

export const s = {
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "11px 14px",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--warn)",
    background: "var(--warn-bg)",
    marginBottom: 18,
  } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  drop: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  failingLabel: { color: "var(--text-muted)" } satisfies CSSProperties,
  failingList: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } satisfies CSSProperties,
} as const;
