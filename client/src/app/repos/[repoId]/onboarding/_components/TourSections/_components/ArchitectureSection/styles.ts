import type React from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    columnGap: 16,
    rowGap: 6,
    margin: 0,
    fontSize: 13,
  } satisfies React.CSSProperties,
  factLabel: {
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  factValue: {
    margin: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: "2px 12px",
    color: "var(--text-primary)",
    minWidth: 0,
  } satisfies React.CSSProperties,
};
