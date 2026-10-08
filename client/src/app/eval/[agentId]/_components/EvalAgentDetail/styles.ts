import type { CSSProperties } from "react";

/** Co-located styles for EvalAgentDetail; its children carry their own. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
    marginBottom: 14,
  } satisfies CSSProperties,
  cards: { display: "flex", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  runsHead: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  selected: { fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  compare: { marginLeft: "auto", marginBottom: 14 } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
