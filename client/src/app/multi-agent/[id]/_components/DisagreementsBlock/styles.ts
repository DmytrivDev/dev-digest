import type { CSSProperties } from "react";

/** Co-located styles for DisagreementsBlock. */
export const s = {
  wrap: { marginTop: 22 } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  group: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  groupHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  } satisfies CSSProperties,
  loc: { fontSize: 12 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, marginLeft: 6 } satisfies CSSProperties,
  takes: (n: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
    gap: 1,
    background: "var(--border)",
  }),
  take: { padding: "10px 14px", background: "var(--bg-elevated)", minWidth: 0 } satisfies CSSProperties,
  takeAgent: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 4,
  } satisfies CSSProperties,
  takeLabelRow: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 } satisfies CSSProperties,
  dot: (color: string): CSSProperties => ({
    width: 7,
    height: 7,
    borderRadius: 99,
    background: color,
    flexShrink: 0,
  }),
  takeLabel: (flagged: boolean): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color: flagged ? "var(--text-primary)" : "var(--text-muted)",
    textTransform: flagged ? "uppercase" : "none",
    letterSpacing: flagged ? "0.03em" : 0,
  }),
  note: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    lineHeight: 1.4,
    wordBreak: "break-word",
  } satisfies CSSProperties,
  message: {
    padding: "18px 14px",
    fontSize: 13,
    color: "var(--text-secondary)",
    border: "1px dashed var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
};
