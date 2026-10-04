import type React from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies React.CSSProperties,
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  grid: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 10,
  } satisfies React.CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 7,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies React.CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.35,
    color: "var(--text-primary)",
  } satisfies React.CSSProperties,
  scope: {
    fontSize: 11,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
  } satisfies React.CSSProperties,
  badge: {
    marginTop: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border-strong)",
  } satisfies React.CSSProperties,
};
