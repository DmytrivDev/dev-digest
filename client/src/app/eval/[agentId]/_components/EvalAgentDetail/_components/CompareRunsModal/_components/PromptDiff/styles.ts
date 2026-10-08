import type { CSSProperties } from "react";

export const s = {
  legend: { display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (background: string): CSSProperties => ({
    width: 12,
    height: 12,
    borderRadius: 3,
    background,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  }),
  pre: {
    margin: 0,
    padding: 14,
    fontSize: 12,
    lineHeight: 1.65,
    background: "var(--code-bg)",
    borderRadius: 7,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 260,
    overflow: "auto",
  } satisfies CSSProperties,
  line: (kind: "context" | "added" | "removed"): CSSProperties => ({
    background: kind === "added" ? "var(--code-add)" : kind === "removed" ? "var(--code-del)" : "transparent",
  }),
  none: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
