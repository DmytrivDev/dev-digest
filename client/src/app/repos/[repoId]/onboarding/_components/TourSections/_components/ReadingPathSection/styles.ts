import type React from "react";

export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies React.CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 11,
    minWidth: 0,
  } satisfies React.CSSProperties,
  /** The numbered step badge from the mock. */
  step: {
    width: 20,
    height: 20,
    flexShrink: 0,
    marginTop: 1,
    borderRadius: 99,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    fontSize: 11,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
  } satisfies React.CSSProperties,
  main: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    overflowWrap: "anywhere",
  } satisfies React.CSSProperties,
  why: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
};
