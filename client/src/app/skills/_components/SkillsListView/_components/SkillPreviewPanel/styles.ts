import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewPanel. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  typeChip: (color: string): CSSProperties => ({
    fontSize: 11.5,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 8px",
    borderRadius: 4,
  }),
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 12.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  sectionLabel: { fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, color: "var(--text-muted)" } satisfies CSSProperties,
  card: {
    padding: 18,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
