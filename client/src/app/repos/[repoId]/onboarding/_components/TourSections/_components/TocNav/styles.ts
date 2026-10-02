import type React from "react";

export const s = {
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontSize: 13,
  } satisfies React.CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 650,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies React.CSSProperties,
  link: (active: boolean): React.CSSProperties => ({
    display: "block",
    padding: "4px 10px",
    borderRadius: 5,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: active ? "var(--accent-text)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    background: active ? "var(--bg-hover)" : "transparent",
    fontWeight: active ? 600 : 400,
    textDecoration: "none",
  }),
};
