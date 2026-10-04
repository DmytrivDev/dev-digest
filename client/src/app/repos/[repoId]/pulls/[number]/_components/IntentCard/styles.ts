import type { CSSProperties } from "react";

export const s = {
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  provenanceRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  } satisfies CSSProperties,
  footer: {
    marginTop: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  // 1 px rule between the intent and the Risk areas block (mock BriefCard).
  divider: {
    height: 1,
    background: "var(--border)",
    margin: "16px 0",
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
