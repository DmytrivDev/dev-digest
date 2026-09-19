import type { CSSProperties } from "react";

/** Co-located styles for ScanSummary. */
export const s = {
  panel: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 9,
    background: "var(--bg-surface)",
    marginBottom: 16,
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
  } satisfies CSSProperties,
  counts: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  headRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  body: {
    padding: "0 14px 14px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    paddingTop: 12,
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    rowGap: 6,
    columnGap: 12,
    margin: 0,
  } satisfies CSSProperties,
  dt: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  dd: { fontSize: 12.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  ddMono: {
    fontSize: 12,
    color: "var(--text-secondary)",
    margin: 0,
    fontFamily: "var(--font-mono, monospace)",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  dropped: { marginTop: 14 } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, margin: "8px 0 0" } satisfies CSSProperties,
  listItem: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "4px 0",
    fontSize: 12.5,
  } satisfies CSSProperties,
  droppedRule: { color: "var(--text-secondary)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  droppedReason: { color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
