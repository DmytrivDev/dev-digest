import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's ContextTab. */
export const s = {
  wrap: { maxWidth: 720, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  note: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginBottom: 14,
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
