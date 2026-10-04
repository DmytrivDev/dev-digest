import type { CSSProperties } from "react";
import { PAGE_MAX_WIDTH, TOC_WIDTH } from "./constants";

/** Co-located styles for OnboardingView. */
export const s = {
  page: {
    padding: "24px 28px 44px",
    maxWidth: PAGE_MAX_WIDTH,
    margin: "0 auto",
  } satisfies CSSProperties,
  title: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: "0 0 18px",
  } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  body: {
    display: "grid",
    gridTemplateColumns: `${TOC_WIDTH}px minmax(0, 1fr)`,
    gap: 28,
    alignItems: "start",
  } satisfies CSSProperties,
  toc: { position: "sticky", top: 16 } satisfies CSSProperties,
  content: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
} as const;
