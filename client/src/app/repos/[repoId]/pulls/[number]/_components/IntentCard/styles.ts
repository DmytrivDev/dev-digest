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
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
