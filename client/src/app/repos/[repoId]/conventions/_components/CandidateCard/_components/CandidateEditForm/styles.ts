import type { CSSProperties } from "react";

/** Co-located styles for CandidateEditForm. */
export const s = {
  form: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center" } satisfies CSSProperties,
  counter: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  counterOver: { fontSize: 11.5, color: "var(--crit)" } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  inlineLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  buttons: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
