import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  editor: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  editorBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  filename: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  tokens: {
    marginLeft: "auto",
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10, alignItems: "center" } satisfies CSSProperties,
  nextVersion: {
    marginLeft: "auto",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  danger: {
    marginTop: 28,
    paddingTop: 18,
    borderTop: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
  dangerText: { flex: 1 } satisfies CSSProperties,
  dangerTitle: { fontSize: 13, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;
