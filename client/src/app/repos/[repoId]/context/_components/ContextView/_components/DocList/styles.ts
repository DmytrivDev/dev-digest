import type { CSSProperties } from "react";

/** Co-located styles for DocList. */
export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    padding: "0 8px 12px",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  } satisfies CSSProperties,
  row: (selected: boolean) =>
    ({
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      width: "100%",
      padding: "7px 9px",
      borderRadius: 6,
      borderWidth: 0,
      cursor: "pointer",
      textAlign: "left",
      fontSize: 12,
      background: selected ? "var(--bg-hover)" : "transparent",
      color: selected ? "var(--text-primary)" : "var(--text-secondary)",
    }) satisfies CSSProperties,
  icon: (selected: boolean) =>
    ({
      flexShrink: 0,
      marginTop: 1,
      color: selected ? "var(--accent)" : "var(--text-muted)",
    }) satisfies CSSProperties,
  path: { overflowWrap: "anywhere", lineHeight: 1.4 } satisfies CSSProperties,
  none: {
    padding: "8px 14px",
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
