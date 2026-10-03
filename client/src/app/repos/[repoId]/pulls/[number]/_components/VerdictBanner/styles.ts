import type { CSSProperties } from "react";

/** Co-located styles for VerdictBanner (extracted from inline styles). */
export const s = {
  wrap: {
    display: "flex",
    gap: 18,
    alignItems: "flex-start",
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  iconBox: (bg: string, color: string): CSSProperties => ({
    width: 40,
    height: 40,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: bg,
    color,
    flexShrink: 0,
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  label: (color: string): CSSProperties => ({ fontSize: 18, fontWeight: 700, color }),
  summary: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    marginTop: 8,
  } satisfies CSSProperties,
  /** Summary with nothing above it (no verdict row) — no top gap. */
  summaryFirst: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", alignItems: "center" } satisfies CSSProperties,
  scoreCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  } satisfies CSSProperties,
  // Top-bordered cost row; the rule only separates it from a score above it.
  costRow: (underScore: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginTop: underScore ? 5 : 0,
    paddingTop: underScore ? 6 : 0,
    borderTopWidth: underScore ? 1 : 0,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
  }),
  cost: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  scoreLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
} as const;
