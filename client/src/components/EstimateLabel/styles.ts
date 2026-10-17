import type { CSSProperties } from "react";

export const s = {
  wrap: { position: "relative", display: "inline-block" } satisfies CSSProperties,
  label: {
    fontSize: 11,
    color: "var(--text-secondary)",
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    cursor: "help",
  } satisfies CSSProperties,
  tip: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 6,
    zIndex: 20,
    width: 280,
    padding: "8px 10px",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
    boxShadow: "var(--shadow-modal)",
  } satisfies CSSProperties,
};
