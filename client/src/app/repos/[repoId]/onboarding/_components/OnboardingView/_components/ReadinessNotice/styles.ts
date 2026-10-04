import type { CSSProperties } from "react";

export const s = {
  notice: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    padding: "12px 14px",
    marginBottom: 16,
    borderRadius: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 240 } satisfies CSSProperties,
} as const;
