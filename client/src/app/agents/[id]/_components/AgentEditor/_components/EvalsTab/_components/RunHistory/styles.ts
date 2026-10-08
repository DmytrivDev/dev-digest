import type { CSSProperties } from "react";

export const s = {
  link: {
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12.5,
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
  } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  } satisfies CSSProperties,
  td: {
    padding: "8px 12px",
    color: "var(--text-secondary)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  } satisfies CSSProperties,
} as const;

/** Badge colours per run status (tokens only). */
export const STATUS_COLOR = {
  running: { color: "var(--warn)", bg: "var(--warn-bg)" },
  completed: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
} as const;
