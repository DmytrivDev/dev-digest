import type { CSSProperties } from "react";

/** Co-located styles for ConfigureRunView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 860, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 22 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  step: { marginBottom: 24 } satisfies CSSProperties,
  stepHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  } satisfies CSSProperties,
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  stepTitle: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
  selectAll: { marginLeft: "auto" } satisfies CSSProperties,
  cards: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: {
    border: "1px dashed var(--border-strong)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
  } satisfies CSSProperties,
  estimate: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
};
