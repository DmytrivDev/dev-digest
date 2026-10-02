import type React from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies React.CSSProperties,
  label: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
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
  } satisfies React.CSSProperties,
  head: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  } satisfies React.CSSProperties,
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies React.CSSProperties,
  scope: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies React.CSSProperties,
};
