import type { CSSProperties } from "react";

/** Co-located styles for DocPreviewPane. */
export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "12px 20px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  } satisfies CSSProperties,
  path: {
    fontSize: 13,
    fontWeight: 600,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  meta: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 14,
  } satisfies CSSProperties,
  usedBy: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  body: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: "20px 28px",
    fontSize: 13.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bodyInner: { maxWidth: 680 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
