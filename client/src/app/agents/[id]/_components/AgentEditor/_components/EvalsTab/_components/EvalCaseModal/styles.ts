import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", height: 480 } satisfies CSSProperties,
  left: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "var(--border)",
  } satisfies CSSProperties,
  right: { display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" } satisfies CSSProperties,
  field: { display: "block", padding: "14px 16px 0" } satisfies CSSProperties,
  fieldLabel: {
    display: "block",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 7,
  } satisfies CSSProperties,
  inputLabel: {
    padding: "14px 16px 0",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 7,
  } satisfies CSSProperties,
  inputBody: { flex: 1, overflow: "auto", padding: "12px 16px" } satisfies CSSProperties,
  source: {
    margin: "10px 16px 16px",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
