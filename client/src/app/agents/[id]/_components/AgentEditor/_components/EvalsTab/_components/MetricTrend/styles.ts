import type { CSSProperties } from "react";

export const s = {
  wrap: { marginBottom: 24 } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
} as const;
