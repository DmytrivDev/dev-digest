import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 22, padding: "20px 24px" } satisfies CSSProperties,
  // Four equal tracks that may shrink below their content: with flex items the
  // COST card ($0.021 → $0.034 +$0.013) overflowed the 920px modal.
  cards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  state: { padding: "28px 24px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 13 } satisfies CSSProperties,
  mono: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  flip: (direction: "now_passing" | "now_failing"): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color: direction === "now_passing" ? "var(--ok)" : "var(--crit)",
  }),
  flipRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  subHeading: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", margin: "8px 0 4px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-start" } satisfies CSSProperties,
} as const;
