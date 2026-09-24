import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflow: "visible",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    cursor: "pointer",
    // Sticky so a long group's header stays visible while its files scroll
    // past. The scroll container is <main>, and nothing above this in the
    // tree sets overflow:hidden.
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "var(--bg-primary)",
    borderRadius: "10px 10px 0 0",
  } satisfies CSSProperties,
  swatch(color: string): CSSProperties {
    return { width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 };
  },
  label: { fontWeight: 600, fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  findingsCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crit)",
  } satisfies CSSProperties,
  findingsDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "currentColor",
    flexShrink: 0,
  } satisfies CSSProperties,
  reviewNotRun: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  filesCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
