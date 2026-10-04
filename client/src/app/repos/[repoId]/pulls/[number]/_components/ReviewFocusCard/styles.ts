import type { CSSProperties } from "react";

export const s = {
  badgeGap: { marginLeft: 10 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    fontSize: 13.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  bullet: {
    color: "var(--accent-text)",
    fontSize: 10,
    flexShrink: 0,
  } satisfies CSSProperties,
  reason: { color: "var(--text-secondary)" } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
} as const;
