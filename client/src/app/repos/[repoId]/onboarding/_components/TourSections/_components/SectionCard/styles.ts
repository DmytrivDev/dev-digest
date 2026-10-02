import type React from "react";

export const s = {
  card: {
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    // Anchor links from the table of contents land below the sticky chrome.
    scrollMarginTop: 16,
  } satisfies React.CSSProperties,
  heading: {
    margin: 0,
    fontSize: 14.5,
    fontWeight: 600,
  } satisfies React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "13px 16px",
    background: "none",
    border: "none",
    color: "var(--text-primary)",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  } satisfies React.CSSProperties,
  iconTile: {
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
  } satisfies React.CSSProperties,
  title: {
    flex: 1,
    minWidth: 0,
  } satisfies React.CSSProperties,
  chevron: (open: boolean): React.CSSProperties => ({
    display: "inline-flex",
    color: "var(--text-muted)",
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
  }),
  body: {
    padding: "2px 16px 16px",
  } satisfies React.CSSProperties,
};
