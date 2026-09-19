import type { CSSProperties } from "react";

/** Co-located styles for the skill PreviewTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  subtitle: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginBottom: 16,
  } satisfies CSSProperties,
  card: {
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    padding: "18px 20px",
  } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    padding: "11px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    marginBottom: 16,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
