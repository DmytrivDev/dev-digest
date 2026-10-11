import type { CSSProperties } from "react";

/** Co-located styles for the trace's "Skills used" section. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  /** A skipped skill is dimmed — it is in the list, but not in the prompt. */
  row: (skipped: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: skipped ? 0.6 : 1,
  }),
  order: {
    width: 18,
    flexShrink: 0,
    fontSize: 11,
    color: "var(--text-muted)",
    textAlign: "right",
  } satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    textDecoration: "none",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  typeChip: (color: string): CSSProperties => ({
    flexShrink: 0,
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 7px",
    borderRadius: 4,
  }),
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  spacer: { flex: 1, minWidth: 8 } satisfies CSSProperties,
  tokens: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  none: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    marginBottom: 10,
  } satisfies CSSProperties,
} as const;
