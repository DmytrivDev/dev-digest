import type { CSSProperties } from "react";

export const s = {
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  lines: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 10,
  } satisfies CSSProperties,
  muted: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  stale: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    fontSize: 12.5,
    color: "var(--warn)",
  } satisfies CSSProperties,
  error: {
    fontSize: 12.5,
    color: "var(--crit)",
    margin: 0,
  } satisfies CSSProperties,
  refresh: (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    padding: 4,
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  }),
  empty: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  emptyText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  emptyTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,
  emptyBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  skeletonCard: {
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
