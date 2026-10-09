import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
    padding: "14px 16px 0",
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } satisfies CSSProperties,
  title: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  action: { marginLeft: "auto" } satisfies CSSProperties,
  field: { display: "block" } satisfies CSSProperties,
  // Visually hidden, still the accessible name of the textarea.
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  error: {
    marginTop: 8,
    padding: "9px 12px",
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 12.5,
  } satisfies CSSProperties,
} as const;
