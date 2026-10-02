import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 280 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "3px 0 0",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  stale: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--warn, var(--text-secondary))",
  } satisfies CSSProperties,
} as const;
