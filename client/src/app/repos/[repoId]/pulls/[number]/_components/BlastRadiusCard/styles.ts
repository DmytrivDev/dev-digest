import type { CSSProperties } from "react";

export const s = {
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  degradedReason: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: -4,
    marginBottom: 14,
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  noDownstream: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "16px 0",
  } satisfies CSSProperties,
  summaryRow: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
    marginBottom: 16,
  } satisfies CSSProperties,
  stat: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  statLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  statIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    gap: 4,
  } satisfies CSSProperties,
  treeGroup: {
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 0",
    background: "none",
    border: "none",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  groupSymbol: {
    fontSize: 13,
    fontWeight: 600,
  } satisfies CSSProperties,
  groupCount: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingLeft: 24,
    paddingBottom: 12,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    paddingLeft: 24,
    marginTop: 4,
  } satisfies CSSProperties,
  symbolPickerTrigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px",
    fontSize: 12.5,
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    cursor: "pointer",
    marginBottom: 12,
  } satisfies CSSProperties,
  legendRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 8,
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendDotSwatch: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
  }),
  groupIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callerIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callerText: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
