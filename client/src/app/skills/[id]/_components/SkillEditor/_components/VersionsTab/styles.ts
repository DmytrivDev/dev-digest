import type { CSSProperties } from "react";

/** Co-located styles for the skill editor's Versions tab. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginBottom: 16,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: `1px solid ${current ? "var(--border-strong)" : "var(--border)"}`,
    background: "var(--bg-elevated)",
  }),
  chip: (current: boolean): CSSProperties => ({
    flexShrink: 0,
    fontSize: 12.5,
    fontWeight: 700,
    color: current ? "var(--accent-text)" : "var(--text-secondary)",
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
    padding: "3px 9px",
    borderRadius: 6,
  }),
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  note: { fontSize: 13, fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  date: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 6, flexShrink: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  diffPre: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.6,
    maxHeight: 460,
    overflow: "auto",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  // All-longhand: mixing `borderLeft` with `border` above makes React warn and
  // the rendered border flicker between renders.
  diffLine: (kind: "ctx" | "add" | "del"): CSSProperties => ({
    display: "block",
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 10,
    paddingRight: 10,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color:
      kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : "var(--text-secondary)",
    background:
      kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
  }),
  diffNone: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
