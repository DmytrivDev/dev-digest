import type { CSSProperties } from "react";

export const s = {
  footer: {
    fontSize: 12,
    color: "var(--text-muted)",
    paddingTop: 4,
  } satisfies CSSProperties,
} as const;
