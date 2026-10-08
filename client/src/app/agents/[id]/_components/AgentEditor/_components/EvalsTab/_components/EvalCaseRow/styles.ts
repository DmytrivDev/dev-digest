import type { CSSProperties } from "react";

export const s = {
  row: (hover: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: hover ? "var(--bg-hover)" : "var(--bg-elevated)",
    cursor: "pointer",
    marginBottom: 6,
  }),
  statusIcon: (color: string): CSSProperties => ({ color, flexShrink: 0 }),
  // A native button so the row is reachable by keyboard; it carries no handler
  // of its own — its click bubbles to the row.
  main: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
    background: "transparent",
    borderWidth: 0,
    padding: 0,
    color: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
  // One line, as in the mock: slugs run to 60 chars and would otherwise wrap
  // beside the kind badge and the severity · category chip.
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  result: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginTop: 2,
    display: "block",
  } satisfies CSSProperties,
  chip: { display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  actions: (hover: boolean): CSSProperties => ({ display: "flex", gap: 2, opacity: hover ? 1 : 0.4 }),
} as const;
