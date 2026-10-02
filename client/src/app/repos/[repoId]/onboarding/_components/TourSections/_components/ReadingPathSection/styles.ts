import type React from "react";

export const s = {
  list: {
    margin: 0,
    paddingLeft: 22,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies React.CSSProperties,
  link: {
    fontSize: 13,
    color: "var(--accent-text)",
    overflowWrap: "anywhere",
  } satisfies React.CSSProperties,
  why: {
    margin: "2px 0 0",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,
};
