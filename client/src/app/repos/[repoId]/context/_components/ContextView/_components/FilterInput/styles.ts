import type { CSSProperties } from "react";

/** Co-located styles for FilterInput. No `outline` is set anywhere on purpose:
 *  the global `:focus-visible` ring (vendor/ui/styles.css) must reach the input,
 *  and an inline `outline: "none"` would override it (WCAG 2.4.7). */
export const s = {
  box: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    padding: 0,
  } satisfies CSSProperties,
} as const;
