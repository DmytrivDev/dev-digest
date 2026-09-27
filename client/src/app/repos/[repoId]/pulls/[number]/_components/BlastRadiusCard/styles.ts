import type { CSSProperties } from "react";
import type { GraphNodeKind } from "./helpers";
import { GRAPH_VIEWPORT_MAX_HEIGHT } from "./constants";

/** Border / fill / text colour per graph node kind. */
const GRAPH_TONE: Record<GraphNodeKind, { border: string; bg: string; text: string }> = {
  symbol: { border: "var(--accent)", bg: "var(--accent-bg)", text: "var(--text-primary)" },
  caller: { border: "var(--border-strong)", bg: "var(--bg-elevated)", text: "var(--text-primary)" },
  endpoint: {
    border: "color-mix(in srgb, var(--accent) 55%, transparent)",
    bg: "color-mix(in srgb, var(--accent) 7%, var(--bg-elevated))",
    text: "color-mix(in srgb, var(--accent) 45%, white)",
  },
  cron: { border: "color-mix(in srgb, var(--warn) 55%, transparent)", bg: "var(--warn-bg)", text: "var(--warn)" },
};

/** Legend swatch colour per node kind — same tone the nodes use. */
export const GRAPH_LEGEND_COLOR: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--text-secondary)",
  endpoint: GRAPH_TONE.endpoint.text,
  cron: "var(--warn)",
};

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
  graphViewport: {
    overflow: "auto",
    maxHeight: GRAPH_VIEWPORT_MAX_HEIGHT,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 10,
    backgroundColor: "var(--bg-primary)",
    backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
    backgroundSize: "18px 18px",
  } satisfies CSSProperties,
  graphFlow: {
    background: "transparent",
    cursor: "default",
  } satisfies CSSProperties,
  graphEdge: (toKind: GraphNodeKind): CSSProperties => ({
    stroke:
      toKind === "endpoint"
        ? "color-mix(in srgb, var(--accent) 45%, transparent)"
        : toKind === "cron"
          ? "color-mix(in srgb, var(--warn) 50%, transparent)"
          : "color-mix(in srgb, var(--text-muted) 65%, transparent)",
    strokeWidth: 1.5,
  }),
  graphNode: (kind: GraphNodeKind, width: number, height: number): CSSProperties => ({
    width,
    height,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 2,
    paddingLeft: 14,
    paddingRight: 14,
    borderWidth: kind === "symbol" ? 1.5 : 1,
    borderStyle: "solid",
    borderColor: GRAPH_TONE[kind].border,
    borderRadius: 8,
    background: GRAPH_TONE[kind].bg,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
    whiteSpace: "nowrap",
  }),
  graphNodeLabel: (kind: GraphNodeKind): CSSProperties => ({
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: kind === "symbol" || kind === "caller" ? 600 : 500,
    color: GRAPH_TONE[kind].text,
  }),
  graphNodeDetail: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    lineHeight: "14px",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  graphHandle: {
    opacity: 0,
    width: 1,
    height: 1,
    minWidth: 0,
    minHeight: 0,
    border: "none",
    pointerEvents: "none",
  } satisfies CSSProperties,
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
