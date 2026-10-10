import type { CSSProperties } from "react";

export type LastRunTone = "ok" | "crit" | "warn" | "none";

export const s = {
  line: (tone: LastRunTone): CSSProperties => ({
    margin: "12px 16px 0",
    padding: "11px 13px",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: tone === "none" ? "var(--bg-surface)" : `var(--${tone}-bg)`,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 9,
  }),
  icon: (tone: LastRunTone): CSSProperties => ({
    color: tone === "none" ? "var(--text-muted)" : `var(--${tone})`,
  }),
  spinner: { color: "var(--accent)", animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
} as const;
