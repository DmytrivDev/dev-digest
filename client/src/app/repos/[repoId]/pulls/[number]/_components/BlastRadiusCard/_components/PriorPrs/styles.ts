import type { CSSProperties } from "react";

export const s = {
  priorPrsWrap: {
    borderTop: "1px solid var(--border)",
    marginTop: 16,
    paddingTop: 12,
  } satisfies CSSProperties,
  priorPrsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "none",
    border: "none",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    padding: "4px 0",
  } satisfies CSSProperties,
  priorPrsIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  priorPrsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingTop: 12,
  } satisfies CSSProperties,
  priorPrRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingBottom: 10,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  priorPrHeaderRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  priorPrMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  priorPrNotes: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
