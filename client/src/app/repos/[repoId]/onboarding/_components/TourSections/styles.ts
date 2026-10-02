import type React from "react";

export const s = {
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  } satisfies React.CSSProperties,
  empty: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
};
