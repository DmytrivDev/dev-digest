import type React from "react";

export const s = {
  card: {
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
    // Anchor links from the table of contents land below the sticky chrome.
    scrollMarginTop: 16,
  } satisfies React.CSSProperties,
  heading: {
    margin: 0,
    fontSize: 15,
    fontWeight: 650,
  } satisfies React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "var(--card-pad)",
    background: "none",
    border: "none",
    color: "var(--text-primary)",
    font: "inherit",
    fontWeight: 650,
    textAlign: "left",
    cursor: "pointer",
  } satisfies React.CSSProperties,
  chevron: {
    display: "inline-flex",
    color: "var(--text-muted)",
  } satisfies React.CSSProperties,
  body: (open: boolean): React.CSSProperties => ({
    padding: open ? "0 var(--card-pad) var(--card-pad)" : 0,
  }),
};
