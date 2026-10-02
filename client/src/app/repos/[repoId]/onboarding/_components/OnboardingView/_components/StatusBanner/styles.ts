import type { CSSProperties } from "react";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 } satisfies CSSProperties,
  banner: (tone: "info" | "error") =>
    ({
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "10px 13px",
      borderRadius: 8,
      fontSize: 12.5,
      color: "var(--text-secondary)",
      background: tone === "error" ? "var(--crit-bg, #2e0a0a)" : "var(--bg-elevated)",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: tone === "error" ? "var(--crit)" : "var(--border)",
    }) satisfies CSSProperties,
  icon: (tone: "info" | "error") =>
    ({
      flexShrink: 0,
      marginTop: 1,
      color: tone === "error" ? "var(--crit)" : "var(--text-muted)",
    }) satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", marginLeft: 6 } satisfies CSSProperties,
} as const;
