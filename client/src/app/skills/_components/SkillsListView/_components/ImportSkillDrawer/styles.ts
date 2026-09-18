import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  picker: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  pickerText: { flex: 1, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hidden: { display: "none" } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  note: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
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
  } satisfies CSSProperties,
  ignoredBox: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    padding: "12px 14px",
  } satisfies CSSProperties,
  ignoredList: {
    margin: "8px 0 0",
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  } satisfies CSSProperties,
  ignoredItem: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  bodyBox: {
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    padding: "12px 14px",
    maxHeight: 320,
    overflow: "auto",
  } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
