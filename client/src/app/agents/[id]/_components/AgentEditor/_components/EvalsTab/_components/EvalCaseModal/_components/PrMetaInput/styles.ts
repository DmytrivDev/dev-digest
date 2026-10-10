import type { CSSProperties } from "react";

export const s = {
  field: { display: "block", marginBottom: 14 } satisfies CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
} as const;
