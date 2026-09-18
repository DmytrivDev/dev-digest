import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's SkillsTab. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 12.5,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginBottom: 14,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (linked: boolean, dragging = false): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    border: `1px solid ${dragging ? "var(--accent)" : "var(--border)"}`,
    background: linked ? "var(--bg-hover)" : "var(--bg-elevated)",
    // The row being dragged stays visible in its NEW position (the list is
    // reordered live), so it is dimmed rather than hidden — a row that
    // disappears mid-drag makes the drop target impossible to read.
    opacity: dragging ? 0.5 : linked ? 1 : 0.7,
  }),
  grip: (disabled: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    padding: 0,
    display: "inline-flex",
    color: disabled ? "transparent" : "var(--text-muted)",
    cursor: disabled ? "default" : "grab",
  }),
  position: {
    width: 20,
    fontSize: 11.5,
    color: "var(--text-muted)",
    textAlign: "right",
  } satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  typeChip: (color: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 7px",
    borderRadius: 4,
  }),
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
