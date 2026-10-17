import type { CSSProperties } from "react";

/** Co-located styles for AgentPerformanceView. */
export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 18,
  } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  selector: { marginLeft: "auto" } satisfies CSSProperties,
  placeholders: { display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  placeholderCards: { display: "flex", gap: 14 } satisfies CSSProperties,
  placeholderCard: { flex: 1 } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
} as const;
