import type React from "react";

export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies React.CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies React.CSSProperties,
  head: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 12,
  } satisfies React.CSSProperties,
  path: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
  } satisfies React.CSSProperties,
  meta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  reason: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,
  open: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies React.CSSProperties,
};
