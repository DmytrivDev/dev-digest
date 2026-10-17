import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  label: { fontSize: 12, color: "var(--text-secondary)", marginRight: 4 } satisfies CSSProperties,
  custom: { display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  input: {
    padding: "6px 8px",
    fontSize: 13,
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 6,
  } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
};
