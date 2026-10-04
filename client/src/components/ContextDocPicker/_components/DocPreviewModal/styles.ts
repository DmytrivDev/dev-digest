import type { CSSProperties } from "react";

/** Co-located styles for DocPreviewModal. */
export const s = {
  body: { padding: "18px 24px", fontSize: 13.5, minHeight: 80 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
} as const;
