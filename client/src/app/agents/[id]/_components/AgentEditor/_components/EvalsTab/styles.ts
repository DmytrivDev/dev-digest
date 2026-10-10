import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab shell. */
export const s = {
  wrap: { maxWidth: 880 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } satisfies CSSProperties,
  heading: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  section: { marginBottom: 24 } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
} as const;
