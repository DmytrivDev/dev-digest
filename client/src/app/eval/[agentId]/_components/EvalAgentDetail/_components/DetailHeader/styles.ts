import type { CSSProperties } from "react";

export const s = {
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
    marginBottom: 14,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 18 } satisfies CSSProperties,
  titleBlock: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  configure: {
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
} as const;
