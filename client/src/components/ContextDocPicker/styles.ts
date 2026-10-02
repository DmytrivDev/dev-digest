import type { CSSProperties } from "react";

/** Co-located styles for ContextDocPicker. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    marginBottom: 12,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 12.5,
    background: "transparent",
    border: "none",
    // No `outline` here on purpose: the global :focus-visible ring must reach the
    // input (WCAG 2.4.7); an inline `outline: "none"` would override it.
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (attached: boolean, dragging = false): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    border: `1px solid ${dragging ? "var(--accent)" : "var(--border)"}`,
    background: attached ? "var(--bg-hover)" : "var(--bg-elevated)",
    // Dimmed rather than hidden while dragged: the list reorders live, and a row
    // that vanishes mid-drag makes the drop target impossible to read.
    opacity: dragging ? 0.5 : attached ? 1 : 0.7,
  }),
  grip: {
    background: "none",
    border: "none",
    padding: 0,
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: "grab",
  } satisfies CSSProperties,
  /** Keeps non-attached rows aligned with attached ones that carry a handle. */
  gripSpacer: { width: 14, flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" } satisfies CSSProperties,
  folder: {
    fontSize: 12,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  categoryChip: {
    fontSize: 10.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    padding: "1px 7px",
    borderRadius: 4,
  } satisfies CSSProperties,
  previewBtn: {
    fontSize: 12,
    color: "var(--accent-text)",
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "3px 9px",
    cursor: "pointer",
  } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: {
    fontSize: 12.5,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 12,
  } satisfies CSSProperties,
} as const;
