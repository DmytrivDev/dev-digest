import type React from "react";

export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  } satisfies React.CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "9px 11px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies React.CSSProperties,
  icon: {
    flexShrink: 0,
    marginTop: 3,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  main: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  } satisfies React.CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  } satisfies React.CSSProperties,
  path: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
  } satisfies React.CSSProperties,
  count: {
    fontSize: 11,
    fontWeight: 500,
    padding: "1px 7px",
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  reason: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,
  /** A ghost button, as in the mock — but a real link, so it opens in a new tab. */
  open: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 9px",
    borderRadius: 6,
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
    textDecoration: "none",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  } satisfies React.CSSProperties,
};
