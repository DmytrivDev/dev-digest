import type React from "react";

export const s = {
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
  } satisfies React.CSSProperties,
  /** The empty-reason callout that replaces a section's rows (AC-43). */
  empty: {
    margin: 0,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "var(--border)",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  emptyIcon: {
    flexShrink: 0,
    marginTop: 2,
  } satisfies React.CSSProperties,
};
