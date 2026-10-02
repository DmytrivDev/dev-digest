import type { CSSProperties } from "react";
import { LIST_WIDTH } from "./constants";

/** Co-located styles for ContextView (layout after the mock's N6 artboard). */
export const s = {
  split: {
    display: "flex",
    height: "100%",
    minHeight: 0,
  } satisfies CSSProperties,
  listColumn: {
    width: LIST_WIDTH,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listHeader: { padding: "14px 14px 10px" } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  h1: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  branch: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    marginBottom: 12,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  notice: {
    padding: "0 14px 8px",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  previewColumn: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  centered: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "24px 28px 44px",
  } satisfies CSSProperties,
  centeredH1: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    marginBottom: 6,
  } satisfies CSSProperties,
  centeredBranch: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginBottom: 18,
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "0 14px",
  } satisfies CSSProperties,
  emptyAction: {
    display: "flex",
    justifyContent: "center",
    marginTop: -20,
  } satisfies CSSProperties,
} as const;
