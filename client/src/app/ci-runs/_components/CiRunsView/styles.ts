import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1500, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  actions: { marginLeft: "auto" } satisfies CSSProperties,
  errorBox: {
    padding: "10px 14px",
    marginBottom: 12,
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
  errorTitle: { fontWeight: 600 } satisfies CSSProperties,
  errorList: { margin: "6px 0 0", paddingLeft: 18, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
