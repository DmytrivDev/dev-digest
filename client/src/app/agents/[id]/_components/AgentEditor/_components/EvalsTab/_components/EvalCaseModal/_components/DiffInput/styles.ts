import type { CSSProperties } from "react";

export const s = {
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
    marginTop: 10,
    padding: "9px 12px",
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  preview: { marginTop: 10 } satisfies CSSProperties,
} as const;
