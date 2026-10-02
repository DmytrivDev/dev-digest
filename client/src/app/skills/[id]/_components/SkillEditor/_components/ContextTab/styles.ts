import type { CSSProperties } from "react";

/** Co-located styles for the skill editor's ContextTab. */
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
  serializes: {
    maxWidth: 720,
    marginTop: 18,
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  serializesLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  pre: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
